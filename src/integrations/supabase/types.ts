export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_meta: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          blocked: boolean
          blocked_reason: string | null
          created_at: string
          expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          blocked?: boolean
          blocked_reason?: string | null
          created_at?: string
          expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          blocked?: boolean
          blocked_reason?: string | null
          created_at?: string
          expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_username: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_user_id: string | null
          target_username: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_username?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
          target_username?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_username?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
          target_username?: string | null
        }
        Relationships: []
      }
      cp_imports: {
        Row: {
          created_at: string
          duplicates: number | null
          file_name: string | null
          file_type: string | null
          id: string
          league_id: string | null
          league_name: string | null
          owner_id: string
          rows_imported: number | null
          season: string | null
        }
        Insert: {
          created_at?: string
          duplicates?: number | null
          file_name?: string | null
          file_type?: string | null
          id?: string
          league_id?: string | null
          league_name?: string | null
          owner_id: string
          rows_imported?: number | null
          season?: string | null
        }
        Update: {
          created_at?: string
          duplicates?: number | null
          file_name?: string | null
          file_type?: string | null
          id?: string
          league_id?: string | null
          league_name?: string | null
          owner_id?: string
          rows_imported?: number | null
          season?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cp_imports_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "cp_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_leagues: {
        Row: {
          country: string | null
          coverage: Json
          created_at: string
          has_league_stats: boolean
          has_matches: boolean
          has_teams: boolean
          id: string
          league_stats: Json
          matches_count: number
          name: string
          normalized_name: string
          owner_id: string
          season: string
          teams_count: number
          updated_at: string
        }
        Insert: {
          country?: string | null
          coverage?: Json
          created_at?: string
          has_league_stats?: boolean
          has_matches?: boolean
          has_teams?: boolean
          id?: string
          league_stats?: Json
          matches_count?: number
          name: string
          normalized_name: string
          owner_id: string
          season?: string
          teams_count?: number
          updated_at?: string
        }
        Update: {
          country?: string | null
          coverage?: Json
          created_at?: string
          has_league_stats?: boolean
          has_matches?: boolean
          has_teams?: boolean
          id?: string
          league_stats?: Json
          matches_count?: number
          name?: string
          normalized_name?: string
          owner_id?: string
          season?: string
          teams_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      cp_matches: {
        Row: {
          away: string
          created_at: string
          home: string
          id: string
          league_id: string
          match_date: string | null
          odds: Json
          owner_id: string
          season: string
          source_batch_id: string | null
          stats: Json
          updated_at: string
        }
        Insert: {
          away: string
          created_at?: string
          home: string
          id?: string
          league_id: string
          match_date?: string | null
          odds?: Json
          owner_id: string
          season?: string
          source_batch_id?: string | null
          stats?: Json
          updated_at?: string
        }
        Update: {
          away?: string
          created_at?: string
          home?: string
          id?: string
          league_id?: string
          match_date?: string | null
          odds?: Json
          owner_id?: string
          season?: string
          source_batch_id?: string | null
          stats?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cp_matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "cp_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_teams: {
        Row: {
          id: string
          league_id: string
          name: string
          owner_id: string
          playstyle: string | null
          stats: Json
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          id?: string
          league_id: string
          name: string
          owner_id: string
          playstyle?: string | null
          stats?: Json
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          id?: string
          league_id?: string
          name?: string
          owner_id?: string
          playstyle?: string | null
          stats?: Json
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cp_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "cp_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_watchlist: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          payload: Json
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          payload?: Json
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          id: string
          success: boolean
          username: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          success?: boolean
          username: string
        }
        Update: {
          attempted_at?: string
          id?: string
          success?: boolean
          username?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
      robot_usage: {
        Row: {
          id: string
          used_at: string
          user_id: string
        }
        Insert: {
          id?: string
          used_at?: string
          user_id: string
        }
        Update: {
          id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_account_active: { Args: { _user_id: string }; Returns: boolean }
      is_premium_or_owner: { Args: { _user_id: string }; Returns: boolean }
      refresh_cp_league_rollup: {
        Args: { _league_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "trial" | "premium"
      app_role: "owner" | "client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["trial", "premium"],
      app_role: ["owner", "client"],
    },
  },
} as const
