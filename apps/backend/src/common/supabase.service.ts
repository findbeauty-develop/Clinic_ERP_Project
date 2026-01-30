import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService {
  private client;

  constructor(private configService: ConfigService) {
    // Try ConfigService first, then fallback to process.env
    const supabaseUrl =
      this.configService.get<string>("SUPABASE_URL") ||
      process.env.SUPABASE_URL;

    const supabaseKey =
      this.configService.get<string>("SUPABASE_SERVICE_ROLE_KEY") ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables"
      );
    }

    this.client = createClient(supabaseUrl, supabaseKey);
  }

  get auth() {
    return this.client.auth;
  }

  getUser(token: string) {
    return this.auth.getUser(token);
  }
}
