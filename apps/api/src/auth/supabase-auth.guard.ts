import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader) {
      throw new UnauthorizedException('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')

    try {
      const {
        data: { user },
        error,
      } = await this.supabase.auth.getUser(token)

      if (error || !user) {
        throw new UnauthorizedException('Invalid token')
      }

      // Attach user to request for use in controllers
      request.user = user
      return true
    } catch (error) {
      throw new UnauthorizedException('Authentication failed')
    }
  }
}
