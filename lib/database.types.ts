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
          cue_when: string | null
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
          cue_when?: string | null
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
          cue_when?: string | null
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
      day_cue_observations: {
        Row: {
          created_at: string
          cue_id: string
          cue_when: string | null
          id: string
          name: string
          sprint_day_id: string
          used: string
          user_id: string
          was_focus: boolean
        }
        Insert: {
          created_at?: string
          cue_id: string
          cue_when?: string | null
          id?: string
          name: string
          sprint_day_id: string
          used: string
          user_id: string
          was_focus?: boolean
        }
        Update: {
          created_at?: string
          cue_id?: string
          cue_when?: string | null
          id?: string
          name?: string
          sprint_day_id?: string
          used?: string
          user_id?: string
          was_focus?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "day_cue_observations_cue_id_fkey"
            columns: ["cue_id"]
            isOneToOne: false
            referencedRelation: "cues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_cue_observations_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_cue_observations_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days_effective"
            referencedColumns: ["id"]
          },
        ]
      }
      day_impediment_observations: {
        Row: {
          created_at: string
          id: string
          impediment_id: string
          name: string
          occurred: string
          sprint_day_id: string
          user_id: string
          was_highest: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          impediment_id: string
          name: string
          occurred: string
          sprint_day_id: string
          user_id: string
          was_highest?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          impediment_id?: string
          name?: string
          occurred?: string
          sprint_day_id?: string
          user_id?: string
          was_highest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "day_impediment_observations_impediment_id_fkey"
            columns: ["impediment_id"]
            isOneToOne: false
            referencedRelation: "impediments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_impediment_observations_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_impediment_observations_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days_effective"
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
          proof_recover: string | null
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
          proof_recover?: string | null
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
          proof_recover?: string | null
          proof_then?: string | null
          proof_when?: string | null
          rank?: number
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      review_decisions: {
        Row: {
          created_at: string
          decision: string
          id: string
          item_id: string
          kind: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          item_id: string
          kind: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          item_id?: string
          kind?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_decisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          lesson: string
          moved_vision: boolean
          sprint_id: string
          user_id: string
          verdict: string | null
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          lesson: string
          moved_vision: boolean
          sprint_id: string
          user_id: string
          verdict?: string | null
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          lesson?: string
          moved_vision?: boolean
          sprint_id?: string
          user_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: true
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      sprint_cues: {
        Row: {
          added_at: string
          cue_id: string
          id: string
          is_focus: boolean
          removed_at: string | null
          sprint_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          cue_id: string
          id?: string
          is_focus?: boolean
          removed_at?: string | null
          sprint_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          cue_id?: string
          id?: string
          is_focus?: boolean
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
          cancelled: boolean
          closed_at: string | null
          closed_on_time: boolean | null
          created_at: string
          date: string
          day_index: number
          highest_impediment_id: string | null
          id: string
          impact: string | null
          intention: string | null
          notes: string | null
          proof_recover: string | null
          proof_then: string | null
          proof_when: string | null
          recovered: string | null
          response: string | null
          sprint_id: string
          target: number
          updated_at: string
          user_id: string
        }
        Insert: {
          actual?: number | null
          cancelled?: boolean
          closed_at?: string | null
          closed_on_time?: boolean | null
          created_at?: string
          date: string
          day_index: number
          highest_impediment_id?: string | null
          id?: string
          impact?: string | null
          intention?: string | null
          notes?: string | null
          proof_recover?: string | null
          proof_then?: string | null
          proof_when?: string | null
          recovered?: string | null
          response?: string | null
          sprint_id: string
          target: number
          updated_at?: string
          user_id: string
        }
        Update: {
          actual?: number | null
          cancelled?: boolean
          closed_at?: string | null
          closed_on_time?: boolean | null
          created_at?: string
          date?: string
          day_index?: number
          highest_impediment_id?: string | null
          id?: string
          impact?: string | null
          intention?: string | null
          notes?: string | null
          proof_recover?: string | null
          proof_then?: string | null
          proof_when?: string | null
          recovered?: string | null
          response?: string | null
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
          closed_at: string | null
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
          closed_at?: string | null
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
          closed_at?: string | null
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
      tasks: {
        Row: {
          archived_at: string | null
          created_at: string
          done: boolean
          id: string
          sprint_day_id: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          done?: boolean
          id?: string
          sprint_day_id: string
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          done?: boolean
          id?: string
          sprint_day_id?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_sprint_day_id_fkey"
            columns: ["sprint_day_id"]
            isOneToOne: false
            referencedRelation: "sprint_days_effective"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_reviews: {
        Row: {
          created_at: string
          id: string
          note: string | null
          user_id: string
          verdict: string
          vision_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          user_id: string
          verdict: string
          vision_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string
          verdict?: string
          vision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_reviews_vision_id_fkey"
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
          baseline: string | null
          body: string
          created_at: string
          deadline: string
          id: string
          meaning: string | null
          obstacle_id: string | null
          proof: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          baseline?: string | null
          body: string
          created_at?: string
          deadline: string
          id?: string
          meaning?: string | null
          obstacle_id?: string | null
          proof?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          baseline?: string | null
          body?: string
          created_at?: string
          deadline?: string
          id?: string
          meaning?: string | null
          obstacle_id?: string | null
          proof?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visions_obstacle_id_fkey"
            columns: ["obstacle_id"]
            isOneToOne: false
            referencedRelation: "impediments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      library_item_usage: {
        Row: {
          active: boolean | null
          item_id: string | null
          kind: string | null
          used: boolean | null
        }
        Relationships: []
      }
      sprint_days_effective: {
        Row: {
          actual: number | null
          attainment: number | null
          closed_on_time: boolean | null
          date: string | null
          day_index: number | null
          highest_impediment_id: string | null
          id: string | null
          impact: string | null
          recovered: string | null
          response: string | null
          sprint_id: string | null
          target: number | null
          user_id: string | null
        }
        Insert: {
          actual?: number | null
          attainment?: never
          closed_on_time?: boolean | null
          date?: string | null
          day_index?: number | null
          highest_impediment_id?: string | null
          id?: string | null
          impact?: string | null
          recovered?: string | null
          response?: string | null
          sprint_id?: string | null
          target?: number | null
          user_id?: string | null
        }
        Update: {
          actual?: number | null
          attainment?: never
          closed_on_time?: boolean | null
          date?: string | null
          day_index?: number | null
          highest_impediment_id?: string | null
          id?: string | null
          impact?: string | null
          recovered?: string | null
          response?: string | null
          sprint_id?: string | null
          target?: number | null
          user_id?: string | null
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
          p_cues?: Json
          p_impact?: string
          p_impediments?: Json
          p_notes?: string
          p_recovered?: string
          p_response?: string
          p_sprint_day_id: string
        }
        Returns: number
      }
      close_sprint_rows: {
        Args: { p_date: string; p_sprint_id: string; p_status: string }
        Returns: undefined
      }
      complete_sprint: { Args: { p_sprint_id: string }; Returns: undefined }
      day_offered_items: {
        Args: { p_sprint_day_id: string }
        Returns: {
          cue_when: string
          explanation: string
          is_focus: boolean
          item_id: string
          kind: string
          name: string
          proof_recover: string
          proof_then: string
          proof_when: string
          rank: number
        }[]
      }
      end_sprint_early: { Args: { p_sprint_id: string }; Returns: undefined }
      finish_review: {
        Args: {
          p_decisions?: Json
          p_lesson: string
          p_moved: boolean
          p_sprint_id: string
          p_verdict?: string
        }
        Returns: string
      }
      finish_sprint: { Args: { p_sprint_id: string }; Returns: undefined }
      insight_cue_usefulness: {
        Args: { p_sprint_id: string }
        Returns: {
          delta_pts: number
          enough: boolean
          is_focus: boolean
          item_id: string
          logged_days: number
          median_unused: number
          median_used: number
          name: string
          unsure_days: number
          unused_days: number
          used_days: number
        }[]
      }
      insight_impediment_impact: {
        Args: { p_sprint_id: string }
        Returns: {
          absent_days: number
          delta_pts: number
          enough: boolean
          felt_a_lot: number
          felt_nothing: number
          felt_some: number
          is_highest: boolean
          item_id: string
          logged_days: number
          median_absent: number
          median_present: number
          name: string
          present_days: number
          unsure_days: number
        }[]
      }
      insight_min_days: { Args: never; Returns: number }
      insight_response_followthrough: {
        Args: { p_sprint_id: string }
        Returns: {
          answered: number
          didnt: number
          enough: boolean
          item_id: string
          name: string
          occurrences: number
          partially: number
          proof_then: string
          ran: number
          rate: number
          unsure: number
        }[]
      }
      insight_response_recovery: {
        Args: { p_sprint_id: string }
        Returns: {
          answered: number
          enough: boolean
          item_id: string
          median_not: number
          median_recovered: number
          name: string
          outcome_enough: boolean
          proof_recover: string
          rate: number
          with_recovered: number
          with_response: number
          without_recovered: number
          without_response: number
        }[]
      }
      insight_sprint_owned: {
        Args: { p_sprint_id: string }
        Returns: undefined
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
      replace_vision: { Args: never; Returns: undefined }
      restore_item: {
        Args: { p_item_id: string; p_kind: string }
        Returns: undefined
      }
      review_vision: {
        Args: { p_note?: string; p_verdict: string }
        Returns: string
      }
      same_daily_targets: {
        Args: { p_amount: number; p_step?: number }
        Returns: number[]
      }
      save_targets: {
        Args: { p_sprint_id: string; p_targets: number[] }
        Returns: undefined
      }
      save_vision: {
        Args: {
          p_baseline?: string
          p_body: string
          p_deadline: string
          p_meaning?: string
          p_proof: string
        }
        Returns: string
      }
      set_focus_cue: {
        Args: { p_cue_id: string; p_sprint_id: string }
        Returns: undefined
      }
      set_highest_impediment: {
        Args: {
          p_impediment_id: string
          p_proof_recover?: string
          p_proof_then?: string
          p_proof_when?: string
          p_sprint_id: string
        }
        Returns: undefined
      }
      set_item_scope: {
        Args: { p_item_id: string; p_kind: string; p_scope: string }
        Returns: Json
      }
      set_vision_obstacle: {
        Args: {
          p_explanation?: string
          p_impediment_id: string
          p_name?: string
        }
        Returns: string
      }
      set_vision_rule: {
        Args: { p_recover: string; p_then: string; p_when: string }
        Returns: undefined
      }
      sprint_best_streak: { Args: { p_sprint_id: string }; Returns: number }
      sprint_for_closure: {
        Args: { p_sprint_id: string }
        Returns: {
          amount: number
          end_date: string
          id: string
          today: string
          total: number
          tz: string
        }[]
      }
      sprint_invalid_reason: {
        Args: { p_exclude_item?: string; p_kind?: string; p_sprint_id: string }
        Returns: string
      }
      sprint_review_summary: {
        Args: { p_sprint_id: string }
        Returns: {
          best_streak: number
          cancelled_days: number
          closed_days: number
          goal: number
          met: boolean
          missed_days: number
          pct: number
          status: string
          total: number
        }[]
      }
      sprint_streak_at: {
        Args: { p_asof: string; p_sprint_id: string }
        Returns: number
      }
      sprint_streaks: {
        Args: never
        Returns: {
          sprint_id: string
          streak: number
        }[]
      }
      start_sprint: {
        Args: {
          p_amount: number
          p_area: string
          p_celebration: string
          p_confidence: number
          p_cue_ids: string[]
          p_currency: string
          p_focus_cue_id: string
          p_highest_impediment_id: string
          p_impediment_ids: string[]
          p_intention?: string
          p_intentions?: string[]
          p_mantra: string
          p_measurement: string
          p_outcome: string
          p_proof_recover?: string
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

