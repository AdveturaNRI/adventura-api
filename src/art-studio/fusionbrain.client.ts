import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BASE_URL = 'https://api-key.fusionbrain.ai/key/api/v1';

export type FusionBrainModel = {
  id: number;
  name: string;
  version: number;
  type: string;
};

export type FusionBrainRunResponse = {
  uuid?: string;
  status?: string;
  error?: string;
  message?: string;
};

export type FusionBrainStatusResponse = {
  uuid: string;
  status: 'INITIAL' | 'PROCESSING' | 'DONE' | 'FAIL' | string;
  errorDescription?: string;
  censored?: boolean;
  images?: string[];
};

@Injectable()
export class FusionBrainClient {
  private readonly logger = new Logger(FusionBrainClient.name);
  private readonly apiKey: string;
  private readonly secretKey: string;
  private cachedModelId: number | null = null;
  private modelCachedAt = 0;
  private static readonly MODEL_TTL_MS = 60 * 60 * 1000;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('FUSIONBRAIN_API_KEY', '').trim();
    this.secretKey = this.config.get<string>('FUSIONBRAIN_SECRET_KEY', '').trim();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.secretKey);
  }

  private authHeaders(): Record<string, string> {
    return {
      'X-Key': `Key ${this.apiKey}`,
      'X-Secret': `Secret ${this.secretKey}`,
    };
  }

  async getModelId(): Promise<number> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Генерация артов временно недоступна.');
    }

    const now = Date.now();
    if (this.cachedModelId != null && now - this.modelCachedAt < FusionBrainClient.MODEL_TTL_MS) {
      return this.cachedModelId;
    }

    const response = await fetch(`${BASE_URL}/models`, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(`models failed ${response.status}: ${text.slice(0, 200)}`);
      throw new ServiceUnavailableException('Не удалось получить доступ к генератору.');
    }

    const models = (await response.json()) as FusionBrainModel[];
    const model = models.find((item) => item.type === 'TEXT2IMAGE') ?? models[0];
    if (!model?.id) {
      throw new ServiceUnavailableException('Генератор сейчас недоступен.');
    }

    this.cachedModelId = model.id;
    this.modelCachedAt = now;
    this.logger.log(`FusionBrain model id=${model.id} ${model.name} v${model.version}`);
    return model.id;
  }

  async runGeneration(params: {
    prompt: string;
    width: number;
    height: number;
  }): Promise<string> {
    const modelId = await this.getModelId();

    const payload = {
      type: 'GENERATE',
      numImages: 1,
      width: params.width,
      height: params.height,
      generateParams: {
        query: params.prompt,
      },
    };

    const form = new FormData();
    form.append('model_id', String(modelId));
    form.append(
      'params',
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    );

    const response = await fetch(`${BASE_URL}/text2image/run`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: form,
    });

    const text = await response.text();
    let data: FusionBrainRunResponse = {};
    try {
      data = JSON.parse(text) as FusionBrainRunResponse;
    } catch {
      this.logger.warn(`run non-json ${response.status}: ${text.slice(0, 200)}`);
      throw new ServiceUnavailableException('Генератор вернул некорректный ответ.');
    }

    if (!response.ok || !data.uuid) {
      this.logger.warn(`run failed ${response.status}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        data.message || data.error || 'Не удалось запустить генерацию. Попробуй позже.',
      );
    }

    return data.uuid;
  }

  async getStatus(uuid: string): Promise<FusionBrainStatusResponse> {
    const response = await fetch(`${BASE_URL}/text2image/status/${uuid}`, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    const text = await response.text();
    let data: FusionBrainStatusResponse;
    try {
      data = JSON.parse(text) as FusionBrainStatusResponse;
    } catch {
      this.logger.warn(`status non-json ${response.status}: ${text.slice(0, 200)}`);
      throw new Error('STATUS_PARSE_ERROR');
    }

    if (!response.ok) {
      this.logger.warn(`status failed ${response.status}: ${text.slice(0, 300)}`);
      throw new Error(data.errorDescription || 'STATUS_HTTP_ERROR');
    }

    return data;
  }
}
