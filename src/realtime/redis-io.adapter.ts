import { INestApplication, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, type RedisClientType } from 'redis';
import { ServerOptions } from 'socket.io';

/**
 * Cross-replica Socket.IO adapter. Without this, `server.to(room).emit`
 * only reaches sockets on the same Nest process.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(url: string): Promise<void> {
    const pubClient: RedisClientType = createClient({ url });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) =>
      this.logger.error(`Redis pub client: ${err.message}`),
    );
    subClient.on('error', (err) =>
      this.logger.error(`Redis sub client: ${err.message}`),
    );

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.IO Redis adapter connected');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (!this.adapterConstructor) {
      throw new Error('RedisIoAdapter.connectToRedis() must run before listen()');
    }
    server.adapter(this.adapterConstructor);
    return server;
  }
}
