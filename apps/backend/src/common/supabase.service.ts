import { Injectable } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService {
  private client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  auth = this.client.auth;

  getUser(token: string) {
    return this.auth.getUser(token);
  }
}

