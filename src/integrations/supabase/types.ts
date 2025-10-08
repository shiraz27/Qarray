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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          contributors: string[] | null
          created_at: string | null
          data: string
          deleted: boolean
          id: number
          question_id: number | null
          updated_at: string | null
          verified: boolean
        }
        Insert: {
          contributors?: string[] | null
          created_at?: string | null
          data: string
          deleted?: boolean
          id?: number
          question_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Update: {
          contributors?: string[] | null
          created_at?: string | null
          data?: string
          deleted?: boolean
          id?: number
          question_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          class_id: number | null
          contributors: string[] | null
          created_at: string | null
          deleted: boolean
          id: number
          name: string
          subject_id: number | null
          updated_at: string | null
          verified: boolean
        }
        Insert: {
          class_id?: number | null
          contributors?: string[] | null
          created_at?: string | null
          deleted?: boolean
          id?: number
          name: string
          subject_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Update: {
          class_id?: number | null
          contributors?: string[] | null
          created_at?: string | null
          deleted?: boolean
          id?: number
          name?: string
          subject_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chapters_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string | null
          hidden: boolean
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hidden?: boolean
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hidden?: boolean
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      devoir_types: {
        Row: {
          devoir_type: string
          id: number
        }
        Insert: {
          devoir_type: string
          id?: number
        }
        Update: {
          devoir_type?: string
          id?: number
        }
        Relationships: []
      }
      institutes: {
        Row: {
          added_by: string | null
          created_at: string | null
          id: string
          name: string
          state_id: number | null
          updated_at: string | null
          verified: boolean
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          name: string
          state_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          name?: string
          state_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "institutes_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class_id: number | null
          created_at: string | null
          deleted: boolean
          full_name: string
          id: string
          institute_id: string | null
          is_moderator: boolean
          phone_number: string | null
          state_id: number | null
          updated_at: string | null
          user_id: string | null
          verified: boolean
        }
        Insert: {
          class_id?: number | null
          created_at?: string | null
          deleted?: boolean
          full_name: string
          id?: string
          institute_id?: string | null
          is_moderator?: boolean
          phone_number?: string | null
          state_id?: number | null
          updated_at?: string | null
          user_id?: string | null
          verified?: boolean
        }
        Update: {
          class_id?: number | null
          created_at?: string | null
          deleted?: boolean
          full_name?: string
          id?: string
          institute_id?: string | null
          is_moderator?: boolean
          phone_number?: string | null
          state_id?: number | null
          updated_at?: string | null
          user_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          chapter_id: number | null
          contributors: string[] | null
          created_at: string | null
          data: string
          deleted: boolean
          id: number
          resource_id: number | null
          updated_at: string | null
          verified: boolean
        }
        Insert: {
          chapter_id?: number | null
          contributors?: string[] | null
          created_at?: string | null
          data: string
          deleted?: boolean
          id?: number
          resource_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Update: {
          chapter_id?: number | null
          contributors?: string[] | null
          created_at?: string | null
          data?: string
          deleted?: boolean
          id?: number
          resource_id?: number | null
          updated_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_types: {
        Row: {
          id: number
          type: string
        }
        Insert: {
          id?: number
          type: string
        }
        Update: {
          id?: number
          type?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          chapter_id: number | null
          contributors: string[] | null
          created_at: string | null
          data: string[]
          deleted: boolean
          description: string
          devoir_type_id: number | null
          id: number
          published_by: string | null
          subject_id: number | null
          title: string
          type_id: number | null
          updated_at: string | null
          verified: boolean
          with_correction: boolean
        }
        Insert: {
          chapter_id?: number | null
          contributors?: string[] | null
          created_at?: string | null
          data: string[]
          deleted?: boolean
          description: string
          devoir_type_id?: number | null
          id?: number
          published_by?: string | null
          subject_id?: number | null
          title: string
          type_id?: number | null
          updated_at?: string | null
          verified?: boolean
          with_correction?: boolean
        }
        Update: {
          chapter_id?: number | null
          contributors?: string[] | null
          created_at?: string | null
          data?: string[]
          deleted?: boolean
          description?: string
          devoir_type_id?: number | null
          id?: number
          published_by?: string | null
          subject_id?: number | null
          title?: string
          type_id?: number | null
          updated_at?: string | null
          verified?: boolean
          with_correction?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "resources_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_devoir_type_id_fkey"
            columns: ["devoir_type_id"]
            isOneToOne: false
            referencedRelation: "devoir_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "resource_types"
            referencedColumns: ["id"]
          },
        ]
      }
      states: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          class_id: number | null
          common: number[] | null
          contributors: string[] | null
          created_at: string | null
          deleted: boolean
          id: number
          logo: string | null
          name: string
          updated_at: string | null
          verified: boolean
        }
        Insert: {
          class_id?: number | null
          common?: number[] | null
          contributors?: string[] | null
          created_at?: string | null
          deleted?: boolean
          id?: number
          logo?: string | null
          name: string
          updated_at?: string | null
          verified?: boolean
        }
        Update: {
          class_id?: number | null
          common?: number[] | null
          contributors?: string[] | null
          created_at?: string | null
          deleted?: boolean
          id?: number
          logo?: string | null
          name?: string
          updated_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          content_id: number
          content_type: string
          created_at: string | null
          id: number
          user_id: string
          vote_type: string
        }
        Insert: {
          content_id: number
          content_type: string
          created_at?: string | null
          id?: number
          user_id: string
          vote_type: string
        }
        Update: {
          content_id?: number
          content_type?: string
          created_at?: string | null
          id?: number
          user_id?: string
          vote_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
