import { Transform } from 'class-transformer';

export function TrimString(): PropertyDecorator {
  return Transform(({ value }) => typeof value === 'string' ? value.trim() : value);
}

export function RejectWhitespaceOnly(): PropertyDecorator {
  return Transform(({ value }) => typeof value === 'string' && value.trim() === '' ? '' : value);
}

export function OptionalNonNegativeDecimalString(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return Number.NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
  });
}
