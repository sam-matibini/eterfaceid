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
          id: string
          list_name: string
          list_version: string | null
          match_score: number | null
          matched_name: string
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
          id?: string
          list_name: string
          list_version?: string | null
          match_score?: number | null
          matched_name: string
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
          id?: string
          list_name?: string
          list_version?: string | null
          match_score?: number | null
          matched_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_hits_case_id_fkey"
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
