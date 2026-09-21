import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  FormGroup,
  H2,
  H3,
  Label,
  Loader,
  MessageBox,
  Select,
  SelectAsync,
  Text,
} from '@adminjs/design-system'
import { ApiClient, useNotice } from 'adminjs'

const api = new ApiClient()
const PAGE_NAME = 'grantRewards'

const GrantRewardsPage = () => {
  const addNotice = useNotice()
  const [catalog, setCatalog] = useState(null)
  const [user, setUser] = useState(null)
  const [state, setState] = useState(null)
  const [badges, setBadges] = useState([])
  const [kind, setKind] = useState(null)
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [grantingReward, setGrantingReward] = useState(false)
  const [grantingCosmetic, setGrantingCosmetic] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getPage({ pageName: PAGE_NAME })
      .then(({ data }) => {
        if (!cancelled) {
          setCatalog(data.catalog || data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          addNotice({ message: 'Не загрузился каталог наград', type: 'error' })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadUsers = useCallback(async (input) => {
    const query = (input || '').trim()
    try {
      const { data } = await api.getPage({
        pageName: PAGE_NAME,
        params: { users: '1', q: query },
      })
      return (data.users || []).map((row) => ({
        value: row.id,
        label: row.label,
      }))
    } catch (error) {
      return []
    }
  }, [])

  const refreshState = useCallback(async (userId) => {
    if (!userId) {
      setState(null)
      return
    }
    const { data } = await api.getPage({
      pageName: PAGE_NAME,
      params: { userId },
    })
    setState(data.state || null)
  }, [])

  const onUserChange = useCallback((selected) => {
    setUser(selected)
    refreshState(selected?.value).catch(() => {
      addNotice({ message: 'Не загрузил текущие награды игрока', type: 'error' })
    })
  }, [addNotice, refreshState])

  const postAction = useCallback(async (fields) => {
    const form = new FormData()
    Object.entries(fields).forEach(([key, value]) => {
      if (value != null && value !== '') {
        form.append(key, String(value))
      }
    })
    const { data } = await api.getPage({
      pageName: PAGE_NAME,
      method: 'post',
      data: form,
    })
    if (data.notice) {
      addNotice(data.notice)
    }
    if (data.state) {
      setState(data.state)
    }
    return data
  }, [addNotice])

  const grantReward = useCallback(async () => {
    const selected = Array.isArray(badges) ? badges : (badges ? [badges] : [])
    if (!user?.value || selected.length === 0) {
      addNotice({ message: 'Выбери игрока и хотя бы одну награду', type: 'error' })
      return
    }
    setGrantingReward(true)
    try {
      await postAction({
        action: 'grantReward',
        userId: user.value,
        badgeTypes: selected.map((row) => row.value).join(','),
      })
    } catch (error) {
      addNotice({ message: 'Не получилось выдать награду', type: 'error' })
    } finally {
      setGrantingReward(false)
    }
  }, [addNotice, badges, postAction, user])

  const grantCosmetic = useCallback(async () => {
    if (!user?.value || !kind?.value) {
      addNotice({ message: 'Выбери игрока и тип косметики', type: 'error' })
      return
    }
    const all = kind.value === 'all' || item?.value === '*'
    if (!all && !item?.value) {
      addNotice({ message: 'Выбери предмет или «все обычные»', type: 'error' })
      return
    }
    setGrantingCosmetic(true)
    try {
      await postAction({
        action: 'unlockCosmetic',
        userId: user.value,
        kind: kind.value,
        itemId: all ? '*' : item.value,
        all: all ? 'true' : 'false',
      })
    } catch (error) {
      addNotice({ message: 'Не получилось выдать косметику', type: 'error' })
    } finally {
      setGrantingCosmetic(false)
    }
  }, [addNotice, item, kind, postAction, user])

  const badgeOptions = useMemo(
    () => (catalog?.badges || []).map((row) => ({
      value: row.value,
      label: row.label,
      description: row.description,
    })),
    [catalog],
  )

  const kindOptions = catalog?.cosmeticKinds || []
  const itemOptions = useMemo(() => {
    if (!kind?.value || kind.value === 'all') {
      return []
    }
    const items = (catalog?.cosmeticItems || [])
      .filter((row) => row.kind === kind.value)
      .map((row) => ({ value: row.value, label: row.label }))
    return [
      { value: '*', label: 'Все обычные, без уникальных с наград' },
      ...items,
    ]
  }, [catalog, kind])

  const ownedSummary = useMemo(() => {
    if (!state) {
      return ''
    }
    const parts = []
    if (state.badges?.length) {
      parts.push(`награды: ${state.badges.map((row) => row.label).join(', ')}`)
    }
    if (state.unlockAllAvatarFrames) {
      parts.push('все обычные рамки')
    }
    if (state.unlockAllAuras) {
      parts.push('все обычные ауры')
    }
    if (state.unlockAllDiceSkins) {
      parts.push('все обычные кубики')
    }
    return parts.length ? `Уже есть: ${parts.join('; ')}` : 'Наград пока нет'
  }, [state])

  if (loading) {
    return (
      <Box variant="grey" p="xl">
        <Loader />
      </Box>
    )
  }

  return (
    <Box variant="grey">
      <Box variant="white" p="xl">
        <H2 mt="0">Выдать награду или косметику</H2>
        <Text mb="xl">
          Награда целиком: значок, кубики, рамка, аура и слоты персонажей. Косметику можно выдать отдельно, без значка.
        </Text>

        <FormGroup>
          <Label required>Игрок</Label>
          <SelectAsync
            value={user}
            onChange={onUserChange}
            loadOptions={loadUsers}
            defaultOptions
            cacheOptions
            placeholder="Начни вводить ник или email"
            noOptionsMessage={({ inputValue }) => (
              inputValue ? 'Никого не нашёл' : 'Введи ник или email'
            )}
            loadingMessage={() => 'Ищу...'}
          />
          {ownedSummary ? (
            <Text mt="default" variant="sm">{ownedSummary}</Text>
          ) : null}
        </FormGroup>

        <Box
          flex
          flexWrap="wrap"
          style={{ gap: 24 }}
          mt="xl"
        >
          <Box variant="card" p="xl" flex flexGrow={1} minWidth="280px">
            <H3 mt="0">Награда целиком</H3>
            <Text mb="xl">
              Можно отметить несколько сразу. По каждой подтянутся значок, кубики, рамка, аура и слоты.
            </Text>
            <FormGroup>
              <Label required>Типы наград</Label>
              <Select
                isMulti
                value={badges}
                onChange={(selected) => setBadges(selected || [])}
                options={badgeOptions}
                placeholder="Выбери одну или несколько"
                closeMenuOnSelect={false}
              />
              {Array.isArray(badges) && badges.length > 0 ? (
                <Text mt="default" variant="sm">
                  Подтянется: {badges.map((row) => row.label).join(', ')}
                </Text>
              ) : null}
            </FormGroup>
            <Button
              mr="default"
              variant="outlined"
              type="button"
              onClick={() => setBadges(badgeOptions)}
            >
              Выбрать все
            </Button>
            <Button
              variant="contained"
              onClick={grantReward}
              disabled={grantingReward}
            >
              {grantingReward
                ? 'Выдаю...'
                : (Array.isArray(badges) && badges.length > 1
                  ? `Выдать ${badges.length} награды`
                  : 'Выдать награду')}
            </Button>
          </Box>

          <Box variant="card" p="xl" flex flexGrow={1} minWidth="280px">
            <H3 mt="0">Только косметика</H3>
            <Text mb="xl">
              Рамка, аура или кубики без значка. Можно открыть все обычные предметы выбранного типа.
            </Text>
            <FormGroup>
              <Label required>Что выдаём</Label>
              <Select
                value={kind}
                onChange={(selected) => {
                  setKind(selected)
                  setItem(null)
                }}
                options={kindOptions}
                placeholder="Рамка, аура, кубики или всё сразу"
              />
            </FormGroup>
            {kind?.value === 'all' ? (
              <MessageBox
                variant="info"
                mb="xl"
                message="Откроет все обычные рамки, ауры и кубики. Уникальные с наград сюда не входят."
              />
            ) : kind?.value ? (
              <FormGroup>
                <Label required>Предмет</Label>
                <Select
                  value={item}
                  onChange={setItem}
                  options={itemOptions}
                  placeholder="Конкретный предмет или все обычные"
                />
              </FormGroup>
            ) : null}
            <Button
              variant="contained"
              onClick={grantCosmetic}
              disabled={grantingCosmetic}
            >
              {grantingCosmetic ? 'Выдаю...' : 'Выдать косметику'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export default GrantRewardsPage
