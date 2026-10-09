export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      site_workers: {
        Row: {
          id: string | null
          worker_id: string | null
          project_id: string | null
          assigned_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      variation_orders: {
        Row: {
          id: string | null
          project_id: string | null
          title: string | null
          description: string | null
          amount: number | null
          status: string | null
          created_by: string | null
          approved_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      payroll: {
        Row: {
          id: string | null
          worker_id: string | null
          month: number | null
          year: number | null
          total_days: number | null
          total_hours: number | null
          overtime_pay: number | null
          basic_pay: number | null
          total_pay: number | null
          status: string | null
          approved_by: string | null
          approved_at: string | null
          paid_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      salary_slips: {
        Row: {
          id: string | null
          worker_id: string | null
          month: string | null
          total_days: number | null
          total_hours: number | null
          overtime_hours: number | null
          basic_pay: number | null
          overtime_pay: number | null
          total_pay: number | null
          status: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      client_activity: {
        Row: {
          id: string | null
          action: string | null
          project_id: string | null
          client_id: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      site_manager_sites: {
        Row: {
          id: string | null
          site_manager_id: string | null
          project_id: string | null
          assigned_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      historical_costs: {
        Row: {
          id: string | null
          square_footage: number | null
          location: string | null
          project_type: string | null
          quality_tier: string | null
          actual_cost: number | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      inventory_logs: {
        Row: {
          id: string | null
          material_id: string | null
          project_id: string | null
          action: string | null
          quantity: number | null
          notes: string | null
          logged_by: string | null
          logged_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      shared_documents: {
        Row: {
          id: string | null
          filename: string | null
          file_url: string | null
          project_id: string | null
          uploaded_by: string | null
          created_at: string | null
          name: string | null
          category: string | null
          status: string | null
          file_name: string | null
          url: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      client_messages: {
        Row: {
          id: string | null
          sender_id: string | null
          receiver_id: string | null
          project_id: string | null
          message_text: string | null
          is_read: boolean | null
          created_at: string | null
          sender_role: string | null
          receiver_role: string | null
          read_at: string | null
          message: string | null
          content: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      issues: {
        Row: {
          id: string | null
          site_id: string | null
          title: string | null
          description: string | null
          severity: string | null
          status: string | null
          reported_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      milestones: {
        Row: {
          id: string | null
          project_id: string | null
          title: string | null
          description: string | null
          planned_date: string | null
          actual_date: string | null
          status: string | null
          completion_percentage: number | null
          created_at: string | null
          due_date: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      workers: {
        Row: {
          id: string | null
          user_id: string | null
          nic_number: string | null
          skill_type: string | null
          daily_rate: number | null
          bank_account: string | null
          site_id: string | null
          joined_date: string | null
          qr_code_url: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      clients: {
        Row: {
          id: string | null
          project_id: string | null
          name: string | null
          company_name: string | null
          access_level: string | null
          created_at: string | null
          email: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      project_expenses: {
        Row: {
          id: string | null
          project_id: string | null
          title: string | null
          description: string | null
          amount: number | null
          expense_date: string | null
          created_by: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      profiles: {
        Row: {
          id: string | null
          full_name: string | null
          role: string | null
          created_at: string | null
          company_name: string | null
          supplier_type: string | null
          contact_number: string | null
          worker_type: string | null
          daily_rate: number | null
          avatar_url: string | null
          bio: string | null
          qr_code: string | null
          email: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      site_reports: {
        Row: {
          id: string | null
          project_id: string | null
          site_id: string | null
          site_manager_id: string | null
          date: string | null
          work_completed: string | null
          workers_present_count: number | null
          materials_used: Json | null
          photos: any | null
          blockers: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      milestone_media: {
        Row: {
          id: string | null
          milestone_id: string | null
          media_type: string | null
          url: string | null
          uploaded_by: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      suppliers: {
        Row: {
          id: string | null
          user_id: string | null
          company_name: string | null
          contact_person: string | null
          phone: string | null
          email: string | null
          materials_supplied: any | null
          created_at: string | null
          supplier_type: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      site_materials: {
        Row: {
          site_id: string | null
          material_id: string | null
          stock_quantity: number | null
          last_updated: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      projects: {
        Row: {
          id: string | null
          name: string | null
          location: string | null
          client_id: string | null
          pm_id: string | null
          start_date: string | null
          end_date: string | null
          status: string | null
          total_budget: number | null
          completion_percentage: number | null
          description: string | null
          created_at: string | null
          latitude: number | null
          longitude: number | null
          address: string | null
          spent_cost: number | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      sites: {
        Row: {
          id: string | null
          project_id: string | null
          site_manager_id: string | null
          address: string | null
          gps_lat: number | null
          gps_lng: number | null
          active: boolean | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      invoices: {
        Row: {
          id: string | null
          po_id: string | null
          invoice_number: string | null
          amount: number | null
          status: string | null
          paid_date: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      milestone_notes: {
        Row: {
          id: string | null
          milestone_id: string | null
          note_text: string | null
          author_id: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      project_role_assignments: {
        Row: {
          id: string | null
          project_id: string | null
          user_id: string | null
          role: string | null
          assigned_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      materials: {
        Row: {
          id: string | null
          name: string | null
          unit: string | null
          current_stock: number | null
          minimum_threshold: number | null
          unit_price: number | null
          category: string | null
          created_at: string | null
          project_id: string | null
          last_updated: string | null
          quantity: string | null
          stock_level: number | null
          status: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      worker_details: {
        Row: {
          user_id: string | null
          worker_type: string | null
          daily_rate: number | null
          qr_code: string | null
          updated_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      quotations: {
        Row: {
          id: string | null
          project_id: string | null
          created_by: string | null
          client_name: string | null
          project_details: Json | null
          material_cost: number | null
          labour_cost: number | null
          contingency: number | null
          total_cost: number | null
          timeline_days: number | null
          pdf_url: string | null
          ai_generated: boolean | null
          created_at: string | null
          sent_to_client: boolean | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      messages: {
        Row: {
          id: string | null
          sender_id: string | null
          receiver_id: string | null
          project_id: string | null
          content: string | null
          sent_at: string | null
          is_read: boolean | null
          sender_role: string | null
          receiver_role: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      project_locations: {
        Row: {
          project_id: string | null
          lat: number | null
          lng: number | null
          updated_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      legacy_labour: {
        Row: {
          id: string | null
          project_id: string | null
          worker_name: string | null
          role: string | null
          check_in_time: string | null
          hours_worked: number | null
          status: string | null
          date: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      client_payment_schedule: {
        Row: {
          id: string | null
          project_id: string | null
          description: string | null
          amount: number | null
          due_date: string | null
          status: string | null
          paid_at: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      attendance: {
        Row: {
          id: string | null
          worker_id: string | null
          site_id: string | null
          date: string | null
          check_in_time: string | null
          check_out_time: string | null
          hours_worked: number | null
          overtime_hours: number | null
          qr_scan_verified: boolean | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      users: {
        Row: {
          id: string | null
          full_name: string | null
          role: string | null
          expo_push_token: string | null
          email: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      pm_projects: {
        Row: {
          id: string | null
          pm_id: string | null
          project_id: string | null
          assigned_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      legacy_photos: {
        Row: {
          id: string | null
          created_at: string | null
          project_id: string | null
          uploaded_by: string | null
          url: string | null
          caption: string | null
          category: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      cost_estimates: {
        Row: {
          id: string | null
          project_id: string | null
          created_by: string | null
          version: number | null
          labour_cost: number | null
          materials_cost: number | null
          overhead_cost: number | null
          total_cost: number | null
          raw_json: Json | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      estimations: {
        Row: {
          id: string | null
          project_name: string | null
          estimated_cost: number | null
          status: string | null
          confidence_score: number | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      purchase_orders: {
        Row: {
          id: string | null
          project_id: string | null
          supplier_id: string | null
          supplier_name: string | null
          material_id: string | null
          quantity_ordered: number | null
          unit_price: number | null
          total_price: number | null
          po_number: string | null
          items: string | null
          expected_date: string | null
          status: string | null
          created_at: string | null
          suggested_quantity: number | null
          suggested_date: string | null
          supplier_notes: string | null
          site_id: string | null
          requested_by: string | null
          actual_delivery: string | null
          delivered_at: string | null
          delivered_by: string | null
          received_at: string | null
          received_by: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      site_media: {
        Row: {
          id: string | null
          project_id: string | null
          site_id: string | null
          uploaded_by: string | null
          file_url: string | null
          file_type: string | null
          caption: string | null
          uploaded_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      notifications: {
        Row: {
          id: string | null
          user_id: string | null
          type: string | null
          title: string | null
          message: string | null
          is_read: boolean | null
          sent_via: string | null
          link: string | null
          created_at: string | null
          target_role: string | null
          target_user_id: string | null
          project_id: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      material_requests: {
        Row: {
          id: string | null
          project_id: string | null
          requested_by: string | null
          item_name: string | null
          quantity: number | null
          unit: string | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}
