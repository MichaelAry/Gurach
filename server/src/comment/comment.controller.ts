import type { Actor } from '../auth/session.service.js';
import { Public, CurrentActor } from '../auth/session.guard.js';
import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CommentPage, CommentResponse } from '../contracts/track.contract.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { parseTrackCommentsQuery } from './dto/list-comments-query.dto.js';
import { CommentService } from './comment.service.js';

@ApiTags('comments')
@Controller()
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Post('/tracks/:trackId/comments')
  @ApiParam({ name: 'trackId', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })
  @ApiBody({ type: CreateCommentDto })
  @ApiCreatedResponse({ type: CommentResponse })
  @ApiStandardErrors({ authenticated: true, notFound: true, conflict: true })
  add(@Param('trackId') trackId: string, @Body() dto: CreateCommentDto, @CurrentActor() actor: Actor) { return this.comments.add(trackId, dto, actor); }

  @Public()
  @Get('/tracks/:trackId/comments')
  @ApiParam({ name: 'trackId', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })
  @ApiQuery({ name: 'count', required: false, type: Number, minimum: 1, maximum: 100, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiOkResponse({ type: CommentPage })
  @ApiStandardErrors()
  list(@Param('trackId') trackId: string, @Query() query: Record<string, unknown>) {
    return this.comments.list(parseTrackCommentsQuery(trackId, query));
  }

  @Delete('/comments/:commentId')
  @ApiParam({ name: 'commentId', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })
  @ApiOkResponse({ type: CommentResponse })
  @ApiStandardErrors({ authenticated: true, notFound: true })
  delete(@Param('commentId') commentId: string, @CurrentActor() actor: Actor) { return this.comments.delete(commentId, actor); }

}
