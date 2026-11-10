import { socialRelationsMigration } from './007-social-relations.js';
import type { MigrationDefinition } from '../lib/migration-runner.js';
import { trackLifecycleMigration } from './001-track-lifecycle.js';
import { commentParentsMigration } from './002-comment-parents.js';
import { removeTrackCommentArraysMigration } from './003-remove-track-comment-arrays.js';
import { authIndexesMigration } from './004-auth-indexes.js';
import { queueIndexesMigration } from './006-queue-indexes.js';

export const migrationDefinitions: readonly MigrationDefinition[] = [trackLifecycleMigration, commentParentsMigration, removeTrackCommentArraysMigration, authIndexesMigration, queueIndexesMigration, socialRelationsMigration];
