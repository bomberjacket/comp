import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { db } from '@db';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { auth } from './auth.server';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { FRESH_SESSION_MS, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-login';
import { SkipOrgCheck } from './skip-org-check.decorator';
import type { AuthenticatedRequest } from './types';

class SetPasswordDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword: string;
}

/**
 * Password sign-in settings of the signed-in user. A password is set (or replaced) from
 * a session that is at most 30 minutes old, which in practice means right after signing
 * in by email link: the link is how a first or a forgotten password is set. The
 * authenticator app itself is enrolled through better-auth's two-factor endpoints.
 */
@ApiExcludeController()
@ApiTags('Auth')
@Controller({ path: 'auth/password-login', version: '1' })
@UseGuards(HybridAuthGuard)
@SkipOrgCheck()
export class PasswordLoginController {
  private async sessionUser(req: AuthenticatedRequest): Promise<{ userId: string; sessionCreatedAt: Date | null }> {
    if (req.authType !== 'session' || !req.userId || req.impersonatedBy) {
      throw new ForbiddenException('Sign in as yourself to manage password sign-in');
    }
    const session = req.sessionId
      ? await db.session.findUnique({ where: { id: req.sessionId }, select: { createdAt: true } })
      : null;
    return { userId: req.userId, sessionCreatedAt: session?.createdAt ?? null };
  }

  @Get()
  async status(@Req() req: AuthenticatedRequest) {
    const { userId, sessionCreatedAt } = await this.sessionUser(req);
    const [user, credential] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } }),
      db.account.findFirst({ where: { userId, providerId: 'credential', password: { not: null } }, select: { id: true } }),
    ]);
    return {
      hasPassword: !!credential,
      authenticatorEnabled: !!user?.twoFactorEnabled,
      /** Password sign-in works only with both. */
      passwordSignInReady: !!credential && !!user?.twoFactorEnabled,
      sessionFresh: !!sessionCreatedAt && Date.now() - sessionCreatedAt.getTime() <= FRESH_SESSION_MS,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    };
  }

  @Post('password')
  async setPassword(@Req() req: AuthenticatedRequest, @Body() dto: SetPasswordDto) {
    const { userId, sessionCreatedAt } = await this.sessionUser(req);
    if (!sessionCreatedAt || Date.now() - sessionCreatedAt.getTime() > FRESH_SESSION_MS) {
      throw new ForbiddenException('For safety, sign out and sign in again with an email link, then set the password within 30 minutes.');
    }
    if (dto.newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(dto.newPassword);
    const accounts = await ctx.internalAdapter.findAccounts(userId);
    if (accounts.some((a) => a.providerId === 'credential')) {
      await ctx.internalAdapter.updatePassword(userId, hash);
    } else {
      await ctx.internalAdapter.createAccount({ userId, providerId: 'credential', accountId: userId, password: hash });
    }
    // Every other session of the user ends: a replaced password should not leave old sign-ins alive.
    if (req.sessionId) await db.session.deleteMany({ where: { userId, id: { not: req.sessionId } } });
    return { hasPassword: true };
  }
}
