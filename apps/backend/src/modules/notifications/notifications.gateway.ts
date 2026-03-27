import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { verify, JwtPayload } from "jsonwebtoken";
import type { NotificationItemDto } from "./dto/notification-item.dto";

@WebSocketGateway({
  namespace: "/notifications",
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    const raw =
      (client.handshake.auth?.token as string | undefined) ||
      (typeof client.handshake.headers?.authorization === "string"
        ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
        : undefined);

    if (!raw) {
      this.logger.warn("Socket connect rejected: no token");
      client.disconnect(true);
      return;
    }

    const secret =
      process.env.MEMBER_JWT_SECRET ??
      process.env.SUPABASE_JWT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret) {
      this.logger.error("Socket connect rejected: JWT secret not configured");
      client.disconnect(true);
      return;
    }

    try {
      const payload = verify(raw, secret) as JwtPayload & { sub?: string };
      const memberId = payload.sub as string | undefined;
      if (!memberId) {
        client.disconnect(true);
        return;
      }
      await client.join(`member:${memberId}`);
    } catch (e: any) {
      this.logger.warn(`Socket JWT verify failed: ${e?.message || e}`);
      client.disconnect(true);
    }
  }

  emitNotificationNew(memberId: string, dto: NotificationItemDto) {
    this.server.to(`member:${memberId}`).emit("notification.new", dto);
  }
}
