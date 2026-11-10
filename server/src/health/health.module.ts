import { Module } from '@nestjs/common';
import { HEALTH_API_CONTROLLERS } from '../contracts/api-controller.registry.js';

@Module({ controllers: [...HEALTH_API_CONTROLLERS] })
export class HealthModule {}
