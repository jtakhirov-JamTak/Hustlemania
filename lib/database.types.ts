export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cues: {
        Row: {
          archived_at: string | null
          created_at: string
          explanation: string | null
          id: string
          name: string
          rank: number
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          name: string
          rank: number
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          name?: string
          rank?: number
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      day_cue_helped: {
        Row: {
          created_at: string
          cue_id: string
          id: string
          is_most_useful: boolean
          sprint_day_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cue_id: string
          id?: string
          is_most_useful?: boolean
          sprint_day_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          cue_id?: string
          id?: string
          is_most_useful?: boolean
          sprint_day_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_cue_helped_cue_id_fkey"
            columns: ["cue_id"]
            isOneToOne: false
            referencedRelation: "cues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_cue_helped_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days"
            referencedColumns: ["id"]
          },
        ]
      }
      day_impediment_hurt: {
        Row: {
          created_at: string
          id: string
          impediment_id: string
          is_most_damaging: boolean
          sprint_day_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          impediment_id: string
          is_most_damaging?: boolean
          sprint_day_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          impediment_id?: string
          is_most_damaging?: boolean
          sprint_day_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_impediment_hurt_impediment_id_fkey"
            columns: ["impediment_id"]
            isOneToOne: false
            referencedRelation: "impediments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_impediment_hurt_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days"
            referencedColumns: ["id"]
          },
        ]
      }
      impediments: {
        Row: {
          archived_at: string | null
          created_at: string
          explanation: string | null
          id: string
          name: string
          proof_then: string | null
          proof_when: string | null
          rank: number
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          name: string
          proof_then?: string | null
          proof_when?: string | null
          rank: number
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          name?: string
          proof_then?: string | null
          proof_when?: string | null
          rank?: number
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sprint_cues: {
        Row: {
          added_at: string
          cue_id: string
          id: string
          removed_at: string | null
          sprint_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          cue_id: string
          id?: string
          removed_at?: string | null
          sprint_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          cue_id?: string
          id?: string
          removed_at?: string | null
          sprint_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprint_cues_cue_id_fkey"
            columns: ["cue_id"]
            isOneToOne: false
            referencedRelation: "cues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_cues_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      sprint_days: {
        Row: {
          actual: number | null
          closed_at: string | null
          created_at: string
          date: string
          day_index: number
          highest_impediment_id: string | null
          id: string
          intention: string | null
          notes: string | null
          proof_then: string | null
          proof_when: string | null
          sprint_id: string
          target: number
          updated_at: string
          user_id: string
        }
        Insert: {
          actual?: number | null
          closed_at?: string | null
          created_at?: string
          date: string
          day_index: number
          highest_impediment_id?: string | null
          id?: string
          intention?: string | null
          notes?: string | null
          proof_then?: string | null
          proof_when?: string | null
          sprint_id: string
          target: number
          updated_at?: string
          user_id: string
        }
        Update: {
          actual?: number | null
          closed_at?: string | null
          created_at?: string
          date?: string
          day_index?: number
          highest_impediment_id?: string | null
          id?: string
          intention?: string | null
          notes?: string | null
          proof_then?: string | null
          proof_when?: string | null
          sprint_id?: string
          target?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprint_days_highest_impediment_id_fkey"
            columns: ["highest_impediment_id"]
            isOneToOne: false
            referencedRelation: "impediments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_days_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      sprint_impediments: {
        Row: {
          added_at: string
          id: string
          impediment_id: string
          is_highest: boolean
          removed_at: string | null
          sprint_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          impediment_id: string
          is_highest?: boolean
          removed_at?: string | null
          sprint_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          impediment_id?: string
          is_highest?: boolean
          removed_at?: string | null
          sprint_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprint_impediments_impediment_id_fkey"
            columns: ["impediment_id"]
            isOneToOne: false
            referencedRelation: "impediments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_impediments_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          amount: number
          area: string
          celebration: string
          confidence: number
          created_at: string
          currency: string | null
          end_date: string
          id: string
          mantra: string
          measurement: string
          outcome: string
          start_date: string
          status: string
          target_mode: string
          tz: string
          unit: string | null
          updated_at: string
          usage_of_funds: Json
          user_id: string
          vision_id: string
          why: string
        }
        Insert: {
          amount: number
          area: string
          celebration: string
          confidence: number
          created_at?: string
          currency?: string | null
          end_date: string
          id?: string
          mantra: string
          measurement: string
          outcome: string
          start_date: string
          status?: string
          target_mode?: string
          tz: string
          unit?: string | null
          updated_at?: string
          usage_of_funds?: Json
          user_id: string
          vision_id: string
          why: string
        }
        Update: {
          amount?: number
          area?: string
          celebration?: string
          confidence?: number
          created_at?: string
          currency?: string | null
          end_date?: string
          id?: string
          mantra?: string
          measurement?: string
          outcome?: string
          start_date?: string
          status?: string
          target_mode?: string
          tz?: string
          unit?: string | null
          updated_at?: string
          usage_of_funds?: Json
          user_id?: string
          vision_id?: string
          why?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_vision_id_fkey"
            columns: ["vision_id"]
            isOneToOne: false
            referencedRelation: "visions"
            referencedColumns: ["id"]
          },
        ]
      }
      visions: {
        Row: {
          archived_at: string | null
          area: string
          body: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          area: string
          body: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          area?: string
          body?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_sprint_item: {
        Args: { p_item_id: string; p_kind: string; p_sprint_id: string }
        Returns: undefined
      }
      affected_sprints_check: {
        Args: { p_item_id: string; p_kind: string; p_new_scope: string }
        Returns: Json
      }
      archive_item: {
        Args: { p_item_id: string; p_kind: string }
        Returns: Json
      }
      close_day: {
        Args: {
          p_actual: number
          p_helped?: string[]
          p_hurt?: string[]
          p_most_damaging?: string
          p_most_useful?: string
          p_notes?: string
          p_sprint_day_id: string
        }
        Returns: undefined
      }
      day_offered_items: {
        Args: { p_sprint_day_id: string }
        Returns: {
          explanation: string
          item_id: string
          kind: string
          name: string
          proof_then: string
          proof_when: string
          rank: number
        }[]
      }
      measurement_step: { Args: { p_measurement: string }; Returns: number }
      move_item: {
        Args: { p_direction: string; p_item_id: string; p_kind: string }
        Returns: undefined
      }
      remove_sprint_item: {
        Args: { p_item_id: string; p_kind: string; p_sprint_id: string }
        Returns: undefined
      }
      restore_item: {
        Args: { p_item_id: string; p_kind: string }
        Returns: undefined
      }
      same_daily_targets: {
        Args: { p_amount: number; p_step?: number }
        Returns: number[]
      }
      save_targets: {
        Args: { p_sprint_id: string; p_targets: number[] }
        Returns: undefined
      }
      set_highest_impediment: {
        Args: { p_impediment_id: string; p_sprint_id: string }
        Returns: undefined
      }
      set_item_scope: {
        Args: { p_item_id: string; p_kind: string; p_scope: string }
        Returns: Json
      }
      sprint_invalid_reason: {
        Args: { p_exclude_item?: string; p_kind?: string; p_sprint_id: string }
        Returns: string
      }
      start_sprint: {
        Args: {
          p_amount: number
          p_area: string
          p_celebration: string
          p_confidence: number
          p_cue_ids: string[]
          p_currency: string
          p_highest_impediment_id: string
          p_impediment_ids: string[]
          p_intention?: string
          p_intentions?: string[]
          p_mantra: string
          p_measurement: string
          p_outcome: string
          p_proof_then?: string
          p_proof_when?: string
          p_start_date: string
          p_targets?: number[]
          p_tz: string
          p_unit: string
          p_usage_of_funds: Json
          p_why: string
        }
        Returns: string
      }
      validate_targets: {
        Args: { p_amount: number; p_measurement: string; p_targets: number[] }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

