import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { User } from '../auth/schemas/user.schema.js';
import { FriendsService } from '../friends/friends.service.js';
import { decodeSocialCursor, encodeSocialCursor, socialScope } from '../friends/social-cursor.js';
import type { SocialUserProfile } from '../friends/friends.contract.js';
import type { SearchUsersQueryDto } from './dto/search-users-query.dto.js';
import type { UserSearchPage } from './users.contract.js';
@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>, private readonly friends: FriendsService) {}
  async search(actorId: string, query: SearchUsersQueryDto): Promise<UserSearchPage> {
    const scope = socialScope(actorId, `search:${query.query}`), cursor = decodeSocialCursor(query.cursor, scope);
    if (cursor && (!/^[a-z0-9_]{3,32}$/.test(cursor.value) || !cursor.value.startsWith(query.query))) throw new BadRequestException('Invalid search cursor');
    const blocked = await this.friends.blockedIds(actorId);
    const escaped = query.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = await this.users.find({
      username: { $regex: `^${escaped}` }, disabled: false, _id: { $nin: [new Types.ObjectId(actorId), ...blocked] },
      ...(cursor ? { $or: [{ username: { $gt: cursor.value } }, { username: cursor.value, _id: { $gt: new Types.ObjectId(cursor.after) } }] } : {}),
    }).select('_id username displayName').sort({ username: 1, _id: 1 }).limit(query.count + 1).lean().exec();
    const page = rows.slice(0, query.count), last = page.at(-1);
    const states = await this.friends.relationships(actorId, page.map((row) => String(row._id)));
    return {
      items: page.flatMap((row) => {
        const state = states.get(String(row._id))!;
        return state.status === 'unavailable' || state.status === 'blocked_by_me' ? [] : [{ id: String(row._id), username: row.username, displayName: row.displayName, relationship: state }];
      }),
      nextCursor: rows.length > query.count && last ? encodeSocialCursor(scope, String(last._id), last.username) : null,
    };
  }
  async profile(actorId: string, rawUsername: string): Promise<SocialUserProfile> {
    const username = rawUsername.toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new BadRequestException('Invalid username');
    const row = await this.users.findOne({ username, disabled: false }).select('_id username displayName').lean().exec();
    if (!row) throw new NotFoundException('User unavailable');
    const state = (await this.friends.relationships(actorId, [String(row._id)])).get(String(row._id))!;
    if (state.status === 'unavailable') throw new NotFoundException('User unavailable');
    return { id: String(row._id), username: row.username, displayName: row.displayName, relationship: state };
  }
}
