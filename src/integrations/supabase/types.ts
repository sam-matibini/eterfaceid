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
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          environment: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      business_owners: {
        Row: {
          case_id: string
          control_role: string | null
          created_at: string
          id: string
          name: string
          ownership_pct: number | null
          screening_status: string
        }
        Insert: {
          case_id: string
          control_role?: string | null
          created_at?: string
          id?: string
          name: string
          ownership_pct?: number | null
          screening_status?: string
        }
        Update: {
          case_id?: string
          control_role?: string | null
          created_at?: string
          id?: string
          name?: string
          ownership_pct?: number | null
          screening_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_owners_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_checks: {
        Row: {
          case_id: string
          category: string
          checked_at: string
          detail: string | null
          id: string
          name: string
          result: Database["public"]["Enums"]["check_result"]
          source: string | null
        }
        Insert: {
          case_id: string
          category: string
          checked_at?: string
          detail?: string | null
          id?: string
          name: string
          result?: Database["public"]["Enums"]["check_result"]
          source?: string | null
        }
        Update: {
          case_id?: string
          category?: string
          checked_at?: string
          detail?: string | null
          id?: string
          name?: string
          result?: Database["public"]["Enums"]["check_result"]
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_checks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assigned_to: string | null
          case_type: Database["public"]["Enums"]["case_type"]
          country: string | null
          created_at: string
          created_by: string | null
          decision_note: string | null
          id: string
          reference: string
          risk_level: Database["public"]["Enums"]["risk_level"]
          risk_score: number
          status: Database["public"]["Enums"]["case_status"]
          subject_name: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_type: Database["public"]["Enums"]["case_type"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          decision_note?: string | null
          id?: string
          reference: string
          risk_level?: Database["public"]["Enums"]["risk_level"]
          risk_score?: number
          status?: Database["public"]["Enums"]["case_status"]
          subject_name: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_type?: Database["public"]["Enums"]["case_type"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          decision_note?: string | null
          id?: string
          reference?: string
          risk_level?: Database["public"]["Enums"]["risk_level"]
          risk_score?: number
          status?: Database["public"]["Enums"]["case_status"]
          subject_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_alerts: {
        Row: {
          alert_type: string
          case_id: string
          created_at: string
          detail: string | null
          id: string
          status: string
        }
        Insert: {
          alert_type: string
          case_id: string
          created_at?: string
          detail?: string | null
          id?: string
          status?: string
        }
        Update: {
          alert_type?: string
          case_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_alerts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      screening_hits: {
        Row: {
          case_id: string
          category: Database["public"]["Enums"]["hit_category"]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          detail: string | null
          disposition: Database["public"]["Enums"]["hit_disposition"]
          entity_id: string | null
          id: string
          list_name: string
          list_version: string | null
          match_score: number | null
          matched_name: string
          reasons: Json
          run_id: string | null
        }
        Insert: {
          case_id: string
          category: Database["public"]["Enums"]["hit_category"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          detail?: string | null
          disposition?: Database["public"]["Enums"]["hit_disposition"]
          entity_id?: string | null
          id?: string
          list_name: string
          list_version?: string | null
          match_score?: number | null
          matched_name: string
          reasons?: Json
          run_id?: string | null
        }
        Update: {
          case_id?: string
          category?: Database["public"]["Enums"]["hit_category"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          detail?: string | null
          disposition?: Database["public"]["Enums"]["hit_disposition"]
          entity_id?: string | null
          id?: string
          list_name?: string
          list_version?: string | null
          match_score?: number | null
          matched_name?: string
          reasons?: Json
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_hits_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_hits_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_hits_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "screening_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_runs: {
        Row: {
          birth_date: string | null
          candidates_examined: number
          case_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          engine_version: string
          hit_count: number
          id: string
          subject_name: string
          subject_type: Database["public"]["Enums"]["case_type"]
          threshold: number
        }
        Insert: {
          birth_date?: string | null
          candidates_examined?: number
          case_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          engine_version?: string
          hit_count?: number
          id?: string
          subject_name: string
          subject_type?: Database["public"]["Enums"]["case_type"]
          threshold?: number
        }
        Update: {
          birth_date?: string | null
          candidates_examined?: number
          case_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          engine_version?: string
          hit_count?: number
          id?: string
          subject_name?: string
          subject_type?: Database["public"]["Enums"]["case_type"]
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "screening_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
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
      watchlist_entities: {
        Row: {
          aliases: string[]
          birth_date: string | null
          content_hash: string
          countries: string[]
          created_at: string
          entity_schema: string
          external_id: string
          id: string
          identifiers: string | null
          last_change: string | null
          name: string
          name_norm: string
          programs: string | null
          removed_at: string | null
          source_id: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          aliases?: string[]
          birth_date?: string | null
          content_hash: string
          countries?: string[]
          created_at?: string
          entity_schema?: string
          external_id: string
          id?: string
          identifiers?: string | null
          last_change?: string | null
          name: string
          name_norm: string
          programs?: string | null
          removed_at?: string | null
          source_id: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          aliases?: string[]
          birth_date?: string | null
          content_hash?: string
          countries?: string[]
          created_at?: string
          entity_schema?: string
          external_id?: string
          id?: string
          identifiers?: string | null
          last_change?: string | null
          name?: string
          name_norm?: string
          programs?: string | null
          removed_at?: string | null
          source_id?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_entities_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "watchlist_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_entities_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "watchlist_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_names: {
        Row: {
          entity_id: string
          id: number
          kind: string
          name: string
          name_norm: string
          source_id: string
        }
        Insert: {
          entity_id: string
          id?: number
          kind?: string
          name: string
          name_norm: string
          source_id: string
        }
        Update: {
          entity_id?: string
          id?: number
          kind?: string
          name?: string
          name_norm?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_names_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_names_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "watchlist_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_sources: {
        Row: {
          category: Database["public"]["Enums"]["hit_category"]
          code: string
          created_at: string
          enabled: boolean
          entity_count: number
          feed_url: string
          homepage: string | null
          id: string
          jurisdiction: string | null
          last_refreshed_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["hit_category"]
          code: string
          created_at?: string
          enabled?: boolean
          entity_count?: number
          feed_url: string
          homepage?: string | null
          id?: string
          jurisdiction?: string | null
          last_refreshed_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["hit_category"]
          code?: string
          created_at?: string
          enabled?: boolean
          entity_count?: number
          feed_url?: string
          homepage?: string | null
          id?: string
          jurisdiction?: string | null
          last_refreshed_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      watchlist_versions: {
        Row: {
          added_count: number
          changed_count: number
          completed_at: string | null
          error_detail: string | null
          id: string
          removed_count: number
          row_count: number
          source_id: string
          started_at: string
          status: string
          version_label: string
        }
        Insert: {
          added_count?: number
          changed_count?: number
          completed_at?: string | null
          error_detail?: string | null
          id?: string
          removed_count?: number
          row_count?: number
          source_id: string
          started_at?: string
          status?: string
          version_label: string
        }
        Update: {
          added_count?: number
          changed_count?: number
          completed_at?: string | null
          error_detail?: string | null
          id?: string
          removed_count?: number
          row_count?: number
          source_id?: string
          started_at?: string
          status?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_versions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "watchlist_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write: { Args: { _user_id: string }; Returns: boolean }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_watchlist_names: {
        Args: { _limit?: number; _q: string; _threshold?: number }
        Returns: {
          entity_id: string
          kind: string
          matched_name: string
          matched_norm: string
          sim: number
          source_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "analyst" | "viewer"
      case_status: "pending" | "in_review" | "approved" | "rejected"
      case_type: "person" | "business"
      check_result: "pass" | "fail" | "review" | "not_run"
      hit_category: "sanctions" | "pep" | "rca" | "watchlist" | "adverse_media"
      hit_disposition: "open" | "true_positive" | "false_positive"
      risk_level: "low" | "medium" | "high"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "analyst", "viewer"],
      case_status: ["pending", "in_review", "approved", "rejected"],
      case_type: ["person", "business"],
      check_result: ["pass", "fail", "review", "not_run"],
      hit_category: ["sanctions", "pep", "rca", "watchlist", "adverse_media"],
      hit_disposition: ["open", "true_positive", "false_positive"],
      risk_level: ["low", "medium", "high"],
    },
  },
} as const
