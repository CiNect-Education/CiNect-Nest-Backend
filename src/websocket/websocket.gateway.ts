import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export const WS_NAMESPACE = '/ws';

export enum SeatEvent {
  SEAT_HELD = 'SEAT_HELD',
  SEAT_RELEASED = 'SEAT_RELEASED',
  SEAT_BOOKED = 'SEAT_BOOKED',
  HOLD_EXPIRED = 'HOLD_EXPIRED',
}

@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: { origin: '*' },
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinShowtime')
  handleJoinShowtime(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { showtimeId: string },
  ) {
    const room = this.getRoom(data.showtimeId);
    client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
    return { event: 'joinedShowtime', data: { showtimeId: data.showtimeId } };
  }

  @SubscribeMessage('leaveShowtime')
  handleLeaveShowtime(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { showtimeId: string },
  ) {
    const room = this.getRoom(data.showtimeId);
    client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
    return { event: 'leftShowtime', data: { showtimeId: data.showtimeId } };
  }

  getRoom(showtimeId: string): string {
    return `showtimes:${showtimeId}`;
  }

  emitSeatHeld(showtimeId: string, seatIds: string[]) {
    this.server
      .to(this.getRoom(showtimeId))
      .emit(SeatEvent.SEAT_HELD, { showtimeId, seatIds });
  }

  emitSeatReleased(showtimeId: string, seatIds: string[]) {
    this.server
      .to(this.getRoom(showtimeId))
      .emit(SeatEvent.SEAT_RELEASED, { showtimeId, seatIds });
  }

  emitSeatBooked(showtimeId: string, seatIds: string[]) {
    this.server
      .to(this.getRoom(showtimeId))
      .emit(SeatEvent.SEAT_BOOKED, { showtimeId, seatIds });
  }

  emitHoldExpired(showtimeId: string, seatIds: string[]) {
    this.server
      .to(this.getRoom(showtimeId))
      .emit(SeatEvent.HOLD_EXPIRED, { showtimeId, seatIds });
  }
}
