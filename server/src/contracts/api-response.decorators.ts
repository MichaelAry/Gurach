import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiPayloadTooLargeResponse,
  ApiTooManyRequestsResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from './api-error.dto.js';

export function ApiStandardErrors(options: {
  authenticated?: boolean;
  notFound?: boolean;
  conflict?: boolean;
  payloadTooLarge?: boolean;
  unsupportedMediaType?: boolean;
  rateLimited?: boolean;
} = {}) {
  return applyDecorators(
    ...(options.authenticated ? [ApiUnauthorizedResponse({ type: ApiErrorDto }), ApiForbiddenResponse({ type: ApiErrorDto })] : []),
    ApiBadRequestResponse({ description: 'Request validation failed', type: ApiErrorDto }),
    ...(options.notFound ? [ApiNotFoundResponse({ description: 'Resource not found', type: ApiErrorDto })] : []),
    ...(options.conflict ? [ApiConflictResponse({ description: 'Request conflicts with existing data', type: ApiErrorDto })] : []),
    ...(options.payloadTooLarge ? [ApiPayloadTooLargeResponse({ description: 'Payload too large', type: ApiErrorDto })] : []),
    ...(options.unsupportedMediaType ? [ApiUnsupportedMediaTypeResponse({ description: 'Unsupported media type', type: ApiErrorDto })] : []),
    ...(options.rateLimited ? [ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', type: ApiErrorDto })] : []),
    ApiInternalServerErrorResponse({ description: 'Unexpected server error', type: ApiErrorDto }),
  );
}
