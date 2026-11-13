import { HomeController } from '../home/home.controller.js';
import { FriendsController } from '../friends/friends.controller.js';
import { UsersController } from '../users/users.controller.js';
import { AccountController } from '../account/account.controller.js';
import { QueueController } from '../queue/queue.controller.js';
import { AuthController } from '../auth/auth.controller.js';
import { HealthController } from '../health/health.controller.js';
import { TrackController } from '../track/track.controller.js';
import { CommentController } from '../comment/comment.controller.js';

/** The feature modules and offline OpenAPI document share the same controllers. */
export const TRACK_API_CONTROLLERS = [TrackController] as const;
export const COMMENT_API_CONTROLLERS = [CommentController] as const;
export const HEALTH_API_CONTROLLERS = [HealthController] as const;
export const HOME_API_CONTROLLERS = [HomeController] as const;
export const API_CONTROLLERS = [...HOME_API_CONTROLLERS, ...TRACK_API_CONTROLLERS, ...COMMENT_API_CONTROLLERS, ...HEALTH_API_CONTROLLERS, AuthController, QueueController, AccountController, FriendsController, UsersController] as const;
