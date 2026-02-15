import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!value || !isUUID(value, '4')) {
      throw new BadRequestException(
        `Validation failed: '${metadata.data}' must be a valid UUID`,
      );
    }
    return value;
  }
}
