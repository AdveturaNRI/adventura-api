import { sanitizeAnnouncementBody } from '../announcements/announcement-theme';
import type { PartnerPostsService } from '../partners/partner-posts.service';
import { PARTNER_NEWS_NAVIGATION, partnerScopeOf } from './admin-access';

const TITLE_MAX = 100;
/** Form-only params: the cover picked before the record exists. */
const PENDING_COVER = 'coverPendingFile';
const PENDING_COVER_MIME = `${PENDING_COVER}Mime`;
/** Matches nothing: a PARTNER login without a partner gets an empty list. */
const NO_PARTNER = '__no_partner__';

type ValidationErrorCtor = new (
  propertyErrors: Record<string, { message: string; type?: string }>,
) => Error;

type RecordParams = Record<string, unknown>;
type ActionRequest = {
  method?: string;
  query?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};
type ActionContext = {
  currentAdmin?: unknown;
  pendingCover?: { buffer: Buffer; mimetype: string };
  record?: {
    params: RecordParams;
    toJSON: (admin?: unknown) => unknown;
  };
  resource?: {
    findOne: (
      id: string,
    ) => Promise<{ toJSON: (admin?: unknown) => unknown } | null>;
  };
  [key: string]: unknown;
};
type ActionResponse = {
  record?: { params?: RecordParams };
  [key: string]: unknown;
};

const isPost = (request: ActionRequest) =>
  (request.method ?? '').toLowerCase() === 'post';

const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

/** The Prisma adapter exposes the relation (`partner`), not the raw `partnerId` column. */
function recordPartnerId(params: RecordParams | undefined): unknown {
  return params?.partner ?? params?.partnerId;
}

/** Staff see every record; a PARTNER login only records of its own partner. */
function ownsRecord(context: ActionContext): boolean {
  const scope = partnerScopeOf(context.currentAdmin);
  if (scope === undefined) return true;
  return Boolean(scope) && recordPartnerId(context.record?.params) === scope;
}

function canUseResource(context: ActionContext): boolean {
  return partnerScopeOf(context.currentAdmin) !== null;
}

export function buildPartnerPostResourceOptions(
  posts: PartnerPostsService,
  ValidationError: ValidationErrorCtor,
  coverUploadComponent: string,
  partnerFieldComponent: string,
  bodyEditorComponent: string,
) {
  const preparePayload = (request: ActionRequest, context: ActionContext) => {
    if (!isPost(request) || !request.payload) return request;
    const payload = { ...request.payload };
    const scope = partnerScopeOf(context.currentAdmin);
    // Adapter writes the relation property onto the partnerId column.
    if (scope) payload.partner = scope;
    delete payload.partnerId;

    // Counters and the publish stamp are server-side only.
    delete payload.views;
    delete payload.clicks;
    delete payload.publishedAt;

    const pendingRaw = asText(payload[PENDING_COVER]).trim();
    const pendingMime = asText(payload[PENDING_COVER_MIME], 'image/png');
    delete payload[PENDING_COVER];
    delete payload[PENDING_COVER_MIME];
    if (pendingRaw) {
      const base64 = pendingRaw.includes(',')
        ? (pendingRaw.split(',').pop() ?? '')
        : pendingRaw;
      if (base64) {
        context.pendingCover = {
          buffer: Buffer.from(base64, 'base64'),
          mimetype: pendingMime || 'image/png',
        };
      }
    }

    const errors: Record<string, { message: string }> = {};
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) errors.title = { message: 'Нужен заголовок' };
    else if (title.length > TITLE_MAX) {
      errors.title = {
        message: `Не длиннее ${TITLE_MAX} символов: заголовок виден в узкой карточке`,
      };
    }
    if (!payload.partner) errors.partner = { message: 'Выбери партнёра' };
    const actionUrl =
      typeof payload.actionUrl === 'string' ? payload.actionUrl.trim() : '';
    if (actionUrl && !/^https?:\/\//i.test(actionUrl)) {
      errors.actionUrl = { message: 'Ссылка должна начинаться с https://' };
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);

    payload.title = title;
    payload.actionUrl = actionUrl || null;
    if (typeof payload.body === 'string') {
      const cleaned = sanitizeAnnouncementBody(payload.body);
      const plain = cleaned
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      payload.body = plain ? cleaned : '';
    }
    const wasPublished = context.record?.params.status === 'PUBLISHED';
    if (payload.status === 'PUBLISHED' && !wasPublished) {
      payload.publishedAt = new Date().toISOString();
    }
    return { ...request, payload };
  };

  const afterSave = async (
    response: ActionResponse,
    request: ActionRequest,
    context: ActionContext,
  ) => {
    const id = response.record?.params?.id;
    if (!isPost(request) || typeof id !== 'string' || !id) return response;
    if (context.pendingCover) {
      const { coverUrl } = await posts.uploadCover(id, context.pendingCover);
      if (response.record?.params) response.record.params.coverUrl = coverUrl;
    }
    await posts.afterSave(id);
    return response;
  };

  return {
    navigation: { name: PARTNER_NEWS_NAVIGATION, icon: 'Star' },
    titleProperty: 'title',
    sort: { sortBy: 'createdAt', direction: 'desc' },
    listProperties: [
      'title',
      'partner',
      'status',
      'publishedAt',
      'views',
      'clicks',
    ],
    filterProperties: ['title', 'partner', 'status'],
    showProperties: [
      'title',
      'partner',
      'status',
      'coverUrl',
      'body',
      'actionLabel',
      'actionUrl',
      'publishedAt',
      'views',
      'clicks',
      'createdAt',
      'updatedAt',
    ],
    editProperties: [
      'partner',
      'title',
      'body',
      'coverUrl',
      'actionLabel',
      'actionUrl',
      'status',
    ],
    properties: {
      partner: {
        description:
          'Чья новость. У партнёрского логина поле скрыто: партнёр берётся из аккаунта.',
        components: {
          edit: partnerFieldComponent,
          filter: partnerFieldComponent,
        },
      },
      title: {
        isRequired: true,
        description: `До ${TITLE_MAX} символов. Его увидят в карточке «Наши партнёры» в меню.`,
      },
      body: {
        type: 'textarea',
        description:
          'Жирный, курсив, списки, цитата и ссылка — как в обычной новости.',
        components: {
          edit: bodyEditorComponent,
          show: bodyEditorComponent,
        },
      },
      coverUrl: {
        description: 'Горизонтальная картинка, лучше 16:9.',
        components: { edit: coverUploadComponent, show: coverUploadComponent },
        custom: {
          resourceId: 'PartnerPost',
          actionName: 'uploadCover',
          label: 'Обложка',
          previewAlt: 'Обложка новости',
          previewFit: 'cover',
          pendingFileParam: PENDING_COVER,
        },
      },
      actionLabel: {
        description: 'Текст кнопки, например «Подробнее» или «Записаться».',
      },
      actionUrl: { description: 'Куда ведёт кнопка. Начинается с https://' },
      status: {
        availableValues: [
          { value: 'DRAFT', label: 'Черновик' },
          { value: 'PUBLISHED', label: 'Опубликована' },
          { value: 'ARCHIVED', label: 'Снята' },
        ],
        description:
          'Опубликованная новость сразу появляется в меню и во вкладке «Партнёры» в разделе «Новости». В меню висит самая свежая, пока человек её не прочитает. Прошлые остаются в ленте.',
      },
      publishedAt: {
        isVisible: { list: true, show: true, edit: false, filter: false },
      },
      views: {
        isVisible: { list: true, show: true, edit: false, filter: false },
      },
      clicks: {
        isVisible: { list: true, show: true, edit: false, filter: false },
      },
    },
    actions: {
      list: {
        isAccessible: canUseResource,
        before: (request: ActionRequest, context: ActionContext) => {
          const scope = partnerScopeOf(context.currentAdmin);
          if (scope === undefined) return request;
          return {
            ...request,
            query: {
              ...(request.query ?? {}),
              'filters.partner': scope ?? NO_PARTNER,
            },
          };
        },
      },
      search: { isAccessible: canUseResource },
      new: {
        isAccessible: canUseResource,
        before: preparePayload,
        after: afterSave,
      },
      show: { isAccessible: ownsRecord },
      edit: {
        isAccessible: ownsRecord,
        before: preparePayload,
        after: afterSave,
      },
      delete: { isAccessible: ownsRecord },
      bulkDelete: {
        isAccessible: (context: ActionContext) =>
          partnerScopeOf(context.currentAdmin) === undefined,
      },
      uploadCover: {
        actionType: 'record',
        isVisible: false,
        isAccessible: ownsRecord,
        handler: async (
          request: ActionRequest,
          _response: unknown,
          context: ActionContext,
        ) => {
          const id = asText(context.record?.params.id);
          const current = () => context.record?.toJSON(context.currentAdmin);
          if (!id) {
            return {
              record: current(),
              notice: { message: 'Сначала сохрани новость', type: 'error' },
            };
          }
          const payload = request.payload ?? {};
          const raw = asText(payload.fileBase64).trim();
          const base64 = raw.includes(',') ? (raw.split(',').pop() ?? '') : raw;
          if (!base64) {
            return {
              record: current(),
              notice: { message: 'Файл не передан', type: 'error' },
            };
          }
          try {
            const uploaded = await posts.uploadCover(id, {
              buffer: Buffer.from(base64, 'base64'),
              mimetype: asText(payload.fileMime, 'image/png'),
            });
            const fresh = await context.resource?.findOne(id);
            return {
              record: fresh?.toJSON(context.currentAdmin) ?? current(),
              url: uploaded.coverUrl,
              notice: { message: 'Обложка загружена', type: 'success' },
            };
          } catch (error) {
            return {
              record: current(),
              notice: {
                message:
                  error instanceof Error
                    ? error.message
                    : 'Не удалось загрузить обложку',
                type: 'error',
              },
            };
          }
        },
      },
    },
  };
}
