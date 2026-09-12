import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { MulterError } from 'multer';

import { getMaxUploadFileSizeMessage } from '../upload.constants';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();

    if (exception.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: getMaxUploadFileSizeMessage(),
        error: 'Payload Too Large',
      });
      return;
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
      error: 'Bad Request',
    });
  }
}
