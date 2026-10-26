import React, { useState } from 'react';
import { Box, Button, FormGroup, Input, Label, Text } from '@adminjs/design-system';
import { ApiClient, useNotice } from 'adminjs';

const api = new ApiClient();

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

/** Defaults fit the partner logo; other resources pass overrides via `property.custom`. */
const DEFAULTS = {
  resourceId: 'Partner',
  actionName: 'uploadLogo',
  label: 'URL логотипа',
  previewAlt: 'Логотип партнёра',
  previewFit: 'contain',
  saveFirstHint: 'Сначала сохрани партнёра — потом здесь появится загрузка файла.',
};

const PartnerLogoUpload = (props) => {
  const { property, record, onChange, where } = props;
  const addNotice = useNotice();
  const [busy, setBusy] = useState(false);
  const options = { ...DEFAULTS, ...(property.custom || {}) };

  const path = property.path;
  const value = record?.params?.[path] ?? '';
  const recordId = record?.params?.id ? String(record.params.id) : '';
  const canUpload = Boolean(recordId) && where === 'edit';

  const handleUpload = async (file) => {
    if (!file || !recordId) return;
    setBusy(true);
    try {
      const base64 = await readFileAsDataUrl(file);
      const { data } = await api.recordAction({
        resourceId: options.resourceId,
        recordId,
        actionName: options.actionName,
        method: 'post',
        data: {
          fileBase64: base64,
          fileMime: file.type || 'image/png',
          fileName: file.name || 'logo.png',
        },
      });

      if (data?.notice) {
        addNotice(data.notice);
      }
      const nextUrl = data?.record?.params?.[path] ?? data?.url ?? data?.logoUrl;
      if (nextUrl) {
        onChange(path, nextUrl);
      }
    } catch (error) {
      addNotice({
        message: error instanceof Error ? error.message : 'Не удалось загрузить файл',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormGroup>
      <Label>{property.label || options.label}</Label>
      {value ? (
        <Box mb="default" p="default" variant="grey20" style={{ borderRadius: 8, maxWidth: 280 }}>
          <img
            src={value}
            alt={options.previewAlt}
            style={{ display: 'block', width: '100%', maxHeight: 120, objectFit: options.previewFit }}
          />
        </Box>
      ) : null}

      {canUpload ? (
        <Box mb="default">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleUpload(file);
            }}
          />
          <Text mt="sm" variant="sm" color="grey60">
            {busy ? 'Загружаю…' : 'PNG / JPEG / WebP — сохранится в S3, URL подставится сам.'}
          </Text>
        </Box>
      ) : where === 'edit' && !recordId ? (
        <Text mb="default" variant="sm" color="grey60">
          {options.saveFirstHint}
        </Text>
      ) : null}

      <Input
        width={1}
        value={value}
        disabled={where === 'show'}
        placeholder="https://… или оставь пустым и загрузи файл выше"
        onChange={(event) => onChange(path, event.target.value)}
      />
      {value && where === 'edit' ? (
        <Button mt="default" size="sm" variant="danger" type="button" onClick={() => onChange(path, '')}>
          Очистить URL
        </Button>
      ) : null}
    </FormGroup>
  );
};

export default PartnerLogoUpload;
