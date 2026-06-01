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
      athletes: {
        Row: {
          created_at: string
          current_team_id: string | null
          first_name: string
          full_name: string | null
          id: string
          jersey_number: string | null
          last_name: string
          league: Database["public"]["Enums"]["league_type"] | null
          metadata: Json
          notes: string | null
          organization_id: string
          position: string | null
          shopify_tag: string | null
          slug: string
          status: Database["public"]["Enums"]["athlete_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_team_id?: string | null
          first_name: string
          full_name?: string | null
          id?: string
          jersey_number?: string | null
          last_name: string
          league?: Database["public"]["Enums"]["league_type"] | null
          metadata?: Json
          notes?: string | null
          organization_id: string
          position?: string | null
          shopify_tag?: string | null
          slug: string
          status?: Database["public"]["Enums"]["athlete_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_team_id?: string | null
          first_name?: string
          full_name?: string | null
          id?: string
          jersey_number?: string | null
          last_name?: string
          league?: Database["public"]["Enums"]["league_type"] | null
          metadata?: Json
          notes?: string | null
          organization_id?: string
          position?: string | null
          shopify_tag?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["athlete_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athletes_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "athletes_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      blank_colors: {
        Row: {
          available: boolean
          blank_id: string
          color_name: string
          hex_code: string | null
          id: string
          sort_order: number
        }
        Insert: {
          available?: boolean
          blank_id: string
          color_name: string
          hex_code?: string | null
          id?: string
          sort_order?: number
        }
        Update: {
          available?: boolean
          blank_id?: string
          color_name?: string
          hex_code?: string | null
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "blank_colors_blank_id_fkey"
            columns: ["blank_id"]
            isOneToOne: false
            referencedRelation: "blanks"
            referencedColumns: ["id"]
          },
        ]
      }
      blank_sizes: {
        Row: {
          available: boolean
          blank_id: string
          id: string
          size: string
          sort_order: number
        }
        Insert: {
          available?: boolean
          blank_id: string
          id?: string
          size: string
          sort_order?: number
        }
        Update: {
          available?: boolean
          blank_id?: string
          id?: string
          size?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "blank_sizes_blank_id_fkey"
            columns: ["blank_id"]
            isOneToOne: false
            referencedRelation: "blanks"
            referencedColumns: ["id"]
          },
        ]
      }
      blanks: {
        Row: {
          additional_cost: number
          availability_status: Database["public"]["Enums"]["blank_availability"]
          blank_cost: number | null
          brand: string | null
          color: string | null
          cost: number | null
          cost_last_updated: string | null
          created_at: string
          decoration_cost: number
          fabric: string | null
          fabric_specs: Json
          garment_title: string | null
          garment_type: Database["public"]["Enums"]["garment_type"]
          id: string
          image_url: string | null
          internal_only: boolean
          metadata: Json
          moq: number | null
          name: string
          notes: string | null
          organization_id: string
          price_athlete: number | null
          price_corporate: number | null
          price_standard: number | null
          sellable_as_blank: boolean
          sku: string | null
          slug: string
          style_number: string | null
          supplier: string | null
          updated_at: string
          url: string | null
          vendor: string | null
        }
        Insert: {
          additional_cost?: number
          availability_status?: Database["public"]["Enums"]["blank_availability"]
          blank_cost?: number | null
          brand?: string | null
          color?: string | null
          cost?: number | null
          cost_last_updated?: string | null
          created_at?: string
          decoration_cost?: number
          fabric?: string | null
          fabric_specs?: Json
          garment_title?: string | null
          garment_type?: Database["public"]["Enums"]["garment_type"]
          id?: string
          image_url?: string | null
          internal_only?: boolean
          metadata?: Json
          moq?: number | null
          name: string
          notes?: string | null
          organization_id: string
          price_athlete?: number | null
          price_corporate?: number | null
          price_standard?: number | null
          sellable_as_blank?: boolean
          sku?: string | null
          slug: string
          style_number?: string | null
          supplier?: string | null
          updated_at?: string
          url?: string | null
          vendor?: string | null
        }
        Update: {
          additional_cost?: number
          availability_status?: Database["public"]["Enums"]["blank_availability"]
          blank_cost?: number | null
          brand?: string | null
          color?: string | null
          cost?: number | null
          cost_last_updated?: string | null
          created_at?: string
          decoration_cost?: number
          fabric?: string | null
          fabric_specs?: Json
          garment_title?: string | null
          garment_type?: Database["public"]["Enums"]["garment_type"]
          id?: string
          image_url?: string | null
          internal_only?: boolean
          metadata?: Json
          moq?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          price_athlete?: number | null
          price_corporate?: number | null
          price_standard?: number | null
          sellable_as_blank?: boolean
          sku?: string | null
          slug?: string
          style_number?: string | null
          supplier?: string | null
          updated_at?: string
          url?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blanks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blanks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_order_items: {
        Row: {
          color: string | null
          created_at: string
          id: string
          line_subtotal: number | null
          notes: string | null
          order_request_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          size: string
          unit_retail_price: number | null
          unit_wholesale_price: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          line_subtotal?: number | null
          notes?: string | null
          order_request_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          size: string
          unit_retail_price?: number | null
          unit_wholesale_price?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          line_subtotal?: number | null
          notes?: string | null
          order_request_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          size?: string
          unit_retail_price?: number | null
          unit_wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_order_items_order_request_id_fkey"
            columns: ["order_request_id"]
            isOneToOne: false
            referencedRelation: "bulk_order_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_order_requests: {
        Row: {
          acknowledged_at: string | null
          admin_notes: string | null
          athlete_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          order_number: string | null
          organization_id: string
          priority: string
          requested_by: string
          retail_equivalent: number
          shipped_at: string | null
          shipping_carrier: string | null
          status: Database["public"]["Enums"]["bulk_order_status"]
          team_id: string | null
          total_savings: number
          total_units: number
          tracking_number: string | null
          updated_at: string
          wholesale_subtotal: number
        }
        Insert: {
          acknowledged_at?: string | null
          admin_notes?: string | null
          athlete_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_number?: string | null
          organization_id: string
          priority?: string
          requested_by: string
          retail_equivalent?: number
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: Database["public"]["Enums"]["bulk_order_status"]
          team_id?: string | null
          total_savings?: number
          total_units?: number
          tracking_number?: string | null
          updated_at?: string
          wholesale_subtotal?: number
        }
        Update: {
          acknowledged_at?: string | null
          admin_notes?: string | null
          athlete_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_number?: string | null
          organization_id?: string
          priority?: string
          requested_by?: string
          retail_equivalent?: number
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: Database["public"]["Enums"]["bulk_order_status"]
          team_id?: string | null
          total_savings?: number
          total_units?: number
          tracking_number?: string | null
          updated_at?: string
          wholesale_subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulk_order_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "bulk_order_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "bulk_order_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_order_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_order_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_order_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_order_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "bulk_order_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_designs: {
        Row: {
          collection_id: string
          created_at: string
          design_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          design_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          design_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_designs_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_designs_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_products: {
        Row: {
          collection_id: string
          created_at: string
          product_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          athlete_id: string | null
          collection_type: Database["public"]["Enums"]["collection_type"]
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          metadata: Json
          name: string
          organization_id: string
          slug: string
          start_date: string | null
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id?: string | null
          collection_type?: Database["public"]["Enums"]["collection_type"]
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          slug: string
          start_date?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string | null
          collection_type?: Database["public"]["Enums"]["collection_type"]
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          slug?: string
          start_date?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "collections_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "collections_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "collections_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      design_athletes: {
        Row: {
          athlete_id: string
          created_at: string
          design_id: string
          team_id_at_creation: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          design_id: string
          team_id_at_creation?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          design_id?: string
          team_id_at_creation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "design_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "design_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_athletes_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_athletes_team_id_at_creation_fkey"
            columns: ["team_id_at_creation"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "design_athletes_team_id_at_creation_fkey"
            columns: ["team_id_at_creation"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      design_collections: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      design_files: {
        Row: {
          created_at: string
          design_id: string
          file_extension: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: Database["public"]["Enums"]["design_file_type"]
          id: string
          is_primary: boolean
          metadata: Json
          mime_type: string | null
          sort_order: number
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          design_id: string
          file_extension?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: Database["public"]["Enums"]["design_file_type"]
          id?: string
          is_primary?: boolean
          metadata?: Json
          mime_type?: string | null
          sort_order?: number
          storage_bucket: string
          storage_path: string
        }
        Update: {
          created_at?: string
          design_id?: string
          file_extension?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: Database["public"]["Enums"]["design_file_type"]
          id?: string
          is_primary?: boolean
          metadata?: Json
          mime_type?: string | null
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_files_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
        ]
      }
      design_tags: {
        Row: {
          created_at: string
          design_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          design_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          design_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_tags_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      design_teams: {
        Row: {
          created_at: string
          design_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          design_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          design_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_teams_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "design_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      designs: {
        Row: {
          campaign: string | null
          created_at: string
          description: string | null
          design_collection_id: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          primary_athlete_id: string | null
          primary_team_id: string | null
          season: string | null
          slug: string
          status: Database["public"]["Enums"]["design_status"]
          title: string
          updated_at: string
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          description?: string | null
          design_collection_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          primary_athlete_id?: string | null
          primary_team_id?: string | null
          season?: string | null
          slug: string
          status?: Database["public"]["Enums"]["design_status"]
          title: string
          updated_at?: string
        }
        Update: {
          campaign?: string | null
          created_at?: string
          description?: string | null
          design_collection_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          primary_athlete_id?: string | null
          primary_team_id?: string | null
          season?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["design_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "designs_design_collection_id_fkey"
            columns: ["design_collection_id"]
            isOneToOne: false
            referencedRelation: "design_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_primary_athlete_id_fkey"
            columns: ["primary_athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "designs_primary_athlete_id_fkey"
            columns: ["primary_athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "designs_primary_athlete_id_fkey"
            columns: ["primary_athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_primary_team_id_fkey"
            columns: ["primary_team_id"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "designs_primary_team_id_fkey"
            columns: ["primary_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          error_log: Json
          file_name: string
          id: string
          line_items_attributed: number
          line_items_imported: number
          line_items_unattributed: number
          orders_imported: number
          orders_skipped: number
          organization_id: string
          status: string
          total_rows: number
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_log?: Json
          file_name: string
          id?: string
          line_items_attributed?: number
          line_items_imported?: number
          line_items_unattributed?: number
          orders_imported?: number
          orders_skipped?: number
          organization_id: string
          status?: string
          total_rows?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_log?: Json
          file_name?: string
          id?: string
          line_items_attributed?: number
          line_items_imported?: number
          line_items_unattributed?: number
          orders_imported?: number
          orders_skipped?: number
          organization_id?: string
          status?: string
          total_rows?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      ingestion_jobs: {
        Row: {
          applied_at: string | null
          confidence_scores: Json | null
          created_at: string
          created_by: string | null
          created_product_id: string | null
          error_message: string | null
          extracted_data: Json | null
          id: string
          organization_id: string
          processed_at: string | null
          raw_scrape: Json | null
          retry_count: number
          source_url: string
          status: Database["public"]["Enums"]["ingestion_status"]
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          confidence_scores?: Json | null
          created_at?: string
          created_by?: string | null
          created_product_id?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          organization_id: string
          processed_at?: string | null
          raw_scrape?: Json | null
          retry_count?: number
          source_url: string
          status?: Database["public"]["Enums"]["ingestion_status"]
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          confidence_scores?: Json | null
          created_at?: string
          created_by?: string | null
          created_product_id?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          organization_id?: string
          processed_at?: string | null
          raw_scrape?: Json | null
          retry_count?: number
          source_url?: string
          status?: Database["public"]["Enums"]["ingestion_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_created_product_id_fkey"
            columns: ["created_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_items: {
        Row: {
          attributed_org_id: string | null
          attribution_confidence: string
          attribution_rule_id: string | null
          created_at: string
          id: string
          line_total: number | null
          order_id: string
          organization_id: string
          product_id: string | null
          product_title: string
          quantity: number
          raw_csv_row: Json | null
          shopify_line_item_id: string | null
          sku: string | null
          unit_price: number | null
          updated_at: string
          variant_title: string | null
        }
        Insert: {
          attributed_org_id?: string | null
          attribution_confidence?: string
          attribution_rule_id?: string | null
          created_at?: string
          id?: string
          line_total?: number | null
          order_id: string
          organization_id: string
          product_id?: string | null
          product_title: string
          quantity?: number
          raw_csv_row?: Json | null
          shopify_line_item_id?: string | null
          sku?: string | null
          unit_price?: number | null
          updated_at?: string
          variant_title?: string | null
        }
        Update: {
          attributed_org_id?: string | null
          attribution_confidence?: string
          attribution_rule_id?: string | null
          created_at?: string
          id?: string
          line_total?: number | null
          order_id?: string
          organization_id?: string
          product_id?: string | null
          product_title?: string
          quantity?: number
          raw_csv_row?: Json | null
          shopify_line_item_id?: string | null
          sku?: string | null
          unit_price?: number | null
          updated_at?: string
          variant_title?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          attributed_org_id: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          discount: number | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          import_batch_id: string | null
          imported_at: string
          is_refund: boolean
          is_test: boolean
          order_date: string | null
          organization_id: string
          raw_csv_row: Json | null
          shipping: number | null
          shopify_order_id: string | null
          shopify_order_name: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          attributed_org_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          discount?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          is_refund?: boolean
          is_test?: boolean
          order_date?: string | null
          organization_id: string
          raw_csv_row?: Json | null
          shipping?: number | null
          shopify_order_id?: string | null
          shopify_order_name?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          attributed_org_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          discount?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          is_refund?: boolean
          is_test?: boolean
          order_date?: string | null
          organization_id?: string
          raw_csv_row?: Json | null
          shipping?: number | null
          shopify_order_id?: string | null
          shopify_order_name?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      org_pricing_config: {
        Row: {
          base_markup_pct: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          base_markup_pct?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          base_markup_pct?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          pricing_tier_id: string | null
          shopify_access_token: string | null
          shopify_connected: boolean
          shopify_connected_at: string | null
          shopify_last_sync_at: string | null
          shopify_shop_domain: string | null
          shopify_webhook_secret: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pricing_tier_id?: string | null
          shopify_access_token?: string | null
          shopify_connected?: boolean
          shopify_connected_at?: string | null
          shopify_last_sync_at?: string | null
          shopify_shop_domain?: string | null
          shopify_webhook_secret?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pricing_tier_id?: string | null
          shopify_access_token?: string | null
          shopify_connected?: boolean
          shopify_connected_at?: string | null
          shopify_last_sync_at?: string | null
          shopify_shop_domain?: string | null
          shopify_webhook_secret?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_pricing_tier_id_fkey"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_hidden_products: {
        Row: {
          athlete_id: string
          hidden_at: string
          hidden_by: string | null
          product_id: string
        }
        Insert: {
          athlete_id: string
          hidden_at?: string
          hidden_by?: string | null
          product_id: string
        }
        Update: {
          athlete_id?: string
          hidden_at?: string
          hidden_by?: string | null
          product_id?: string
        }
        Relationships: []
      }
      pricing_tiers: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      product_athletes: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          product_id: string
          role: Database["public"]["Enums"]["athlete_role"]
          team_id_at_release: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          product_id: string
          role?: Database["public"]["Enums"]["athlete_role"]
          team_id_at_release?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          product_id?: string
          role?: Database["public"]["Enums"]["athlete_role"]
          team_id_at_release?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "product_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "product_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_athletes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_athletes_team_id_at_release_fkey"
            columns: ["team_id_at_release"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "product_athletes_team_id_at_release_fkey"
            columns: ["team_id_at_release"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribution_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          match_pattern: string
          match_type: string
          notes: string | null
          organization_id: string
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_pattern: string
          match_type: string
          notes?: string | null
          organization_id: string
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_pattern?: string
          match_type?: string
          notes?: string | null
          organization_id?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_collections: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: []
      }
      product_designs: {
        Row: {
          created_at: string
          design_id: string
          id: string
          is_variation: boolean | null
          placement: Database["public"]["Enums"]["design_placement"]
          product_id: string
          sort_order: number
          variation_label: string | null
          variation_of: string | null
        }
        Insert: {
          created_at?: string
          design_id: string
          id?: string
          is_variation?: boolean | null
          placement?: Database["public"]["Enums"]["design_placement"]
          product_id: string
          sort_order?: number
          variation_label?: string | null
          variation_of?: string | null
        }
        Update: {
          created_at?: string
          design_id?: string
          id?: string
          is_variation?: boolean | null
          placement?: Database["public"]["Enums"]["design_placement"]
          product_id?: string
          sort_order?: number
          variation_label?: string | null
          variation_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_designs_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_designs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_designs_variation_of_fkey"
            columns: ["variation_of"]
            isOneToOne: false
            referencedRelation: "product_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          file_name: string | null
          id: string
          is_primary: boolean
          metadata: Json
          product_id: string
          sort_order: number
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          product_id: string
          sort_order?: number
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          product_id?: string
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_social_assets: {
        Row: {
          athlete_id: string | null
          caption: string | null
          created_at: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          organization_id: string
          product_id: string
          sort_order: number
          storage_bucket: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          athlete_id?: string | null
          caption?: string | null
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          organization_id: string
          product_id: string
          sort_order?: number
          storage_bucket?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          athlete_id?: string | null
          caption?: string | null
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          product_id?: string
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      product_tags: {
        Row: {
          created_at: string
          product_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_teams: {
        Row: {
          created_at: string
          product_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_teams_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "product_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      product_videos: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          metadata: Json | null
          organization_id: string
          product_id: string
          sort_order: number | null
          storage_bucket: string
          storage_path: string
          thumbnail_path: string | null
          title: string | null
          updated_at: string
          video_type: string | null
          visible_on_storefront: boolean | null
          visible_to_athlete: boolean | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          organization_id: string
          product_id: string
          sort_order?: number | null
          storage_bucket?: string
          storage_path: string
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string
          video_type?: string | null
          visible_on_storefront?: boolean | null
          visible_to_athlete?: boolean | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          product_id?: string
          sort_order?: number | null
          storage_bucket?: string
          storage_path?: string
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string
          video_type?: string | null
          visible_on_storefront?: boolean | null
          visible_to_athlete?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "product_videos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_videos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ai_confidence_score: number | null
          blank_id: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          id: string
          is_hidden_from_dashboard: boolean
          metadata: Json
          needs_review: boolean
          notes: string | null
          organization_id: string
          price: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          shopify_handle: string | null
          shopify_last_synced_at: string | null
          shopify_product_id: string | null
          shopify_sync_status: Database["public"]["Enums"]["shopify_sync_status"]
          shopify_variant_ids: Json
          sku: string | null
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at: string
          wholesale_price: number | null
          wholesale_price_source: string
        }
        Insert: {
          ai_confidence_score?: number | null
          blank_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_hidden_from_dashboard?: boolean
          metadata?: Json
          needs_review?: boolean
          notes?: string | null
          organization_id: string
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"]
          shopify_handle?: string | null
          shopify_last_synced_at?: string | null
          shopify_product_id?: string | null
          shopify_sync_status?: Database["public"]["Enums"]["shopify_sync_status"]
          shopify_variant_ids?: Json
          sku?: string | null
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at?: string
          wholesale_price?: number | null
          wholesale_price_source?: string
        }
        Update: {
          ai_confidence_score?: number | null
          blank_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_hidden_from_dashboard?: boolean
          metadata?: Json
          needs_review?: boolean
          notes?: string | null
          organization_id?: string
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"]
          shopify_handle?: string | null
          shopify_last_synced_at?: string | null
          shopify_product_id?: string | null
          shopify_sync_status?: Database["public"]["Enums"]["shopify_sync_status"]
          shopify_variant_ids?: Json
          sku?: string | null
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          title?: string
          updated_at?: string
          wholesale_price?: number | null
          wholesale_price_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_blank_id_fkey"
            columns: ["blank_id"]
            isOneToOne: false
            referencedRelation: "blanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_splits: {
        Row: {
          athlete_id: string
          basis: Database["public"]["Enums"]["split_basis"]
          collection_id: string | null
          created_at: string
          effective_date: string
          end_date: string | null
          id: string
          notes: string | null
          organization_id: string
          percentage: number
          product_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          basis: Database["public"]["Enums"]["split_basis"]
          collection_id?: string | null
          created_at?: string
          effective_date?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          percentage: number
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          basis?: Database["public"]["Enums"]["split_basis"]
          collection_id?: string | null
          created_at?: string
          effective_date?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          percentage?: number
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_splits_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "revenue_splits_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "revenue_splits_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_mapping_queue: {
        Row: {
          created_at: string
          id: string
          ignored: boolean
          match_confidence: number | null
          organization_id: string
          product_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          shopify_collections: string[] | null
          shopify_product_type: string | null
          shopify_tags: string[] | null
          shopify_title: string
          shopify_vendor: string | null
          suggested_athlete_ids: string[] | null
          suggested_team_ids: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ignored?: boolean
          match_confidence?: number | null
          organization_id: string
          product_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          shopify_collections?: string[] | null
          shopify_product_type?: string | null
          shopify_tags?: string[] | null
          shopify_title: string
          shopify_vendor?: string | null
          suggested_athlete_ids?: string[] | null
          suggested_team_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ignored?: boolean
          match_confidence?: number | null
          organization_id?: string
          product_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          shopify_collections?: string[] | null
          shopify_product_type?: string | null
          shopify_tags?: string[] | null
          shopify_title?: string
          shopify_vendor?: string | null
          suggested_athlete_ids?: string[] | null
          suggested_team_ids?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_mapping_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_mapping_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_mapping_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_mapping_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_order_line_items: {
        Row: {
          created_at: string
          fulfillable_quantity: number | null
          fulfillment_status:
            | Database["public"]["Enums"]["shopify_fulfillment_status"]
            | null
          id: string
          line_total: number | null
          organization_id: string
          price: number | null
          product_id: string | null
          product_title: string
          properties: Json | null
          quantity: number
          shopify_line_item_id: string
          shopify_order_uuid: string
          shopify_product_id: string | null
          shopify_variant_id: string | null
          sku: string | null
          total_discount: number | null
          variant_title: string | null
          vendor: string | null
        }
        Insert: {
          created_at?: string
          fulfillable_quantity?: number | null
          fulfillment_status?:
            | Database["public"]["Enums"]["shopify_fulfillment_status"]
            | null
          id?: string
          line_total?: number | null
          organization_id: string
          price?: number | null
          product_id?: string | null
          product_title: string
          properties?: Json | null
          quantity: number
          shopify_line_item_id: string
          shopify_order_uuid: string
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          total_discount?: number | null
          variant_title?: string | null
          vendor?: string | null
        }
        Update: {
          created_at?: string
          fulfillable_quantity?: number | null
          fulfillment_status?:
            | Database["public"]["Enums"]["shopify_fulfillment_status"]
            | null
          id?: string
          line_total?: number | null
          organization_id?: string
          price?: number | null
          product_id?: string | null
          product_title?: string
          properties?: Json | null
          quantity?: number
          shopify_line_item_id?: string
          shopify_order_uuid?: string
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          total_discount?: number | null
          variant_title?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_order_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_order_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_order_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_order_line_items_shopify_order_uuid_fkey"
            columns: ["shopify_order_uuid"]
            isOneToOne: false
            referencedRelation: "shopify_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_orders: {
        Row: {
          cancel_reason: string | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_first_name: string | null
          customer_last_name: string | null
          financial_status:
            | Database["public"]["Enums"]["shopify_financial_status"]
            | null
          first_synced_at: string
          fulfillment_status:
            | Database["public"]["Enums"]["shopify_fulfillment_status"]
            | null
          id: string
          last_synced_at: string
          line_item_count: number | null
          note: string | null
          order_status:
            | Database["public"]["Enums"]["shopify_order_status"]
            | null
          organization_id: string
          raw_payload: Json | null
          shopify_cancelled_at: string | null
          shopify_created_at: string | null
          shopify_customer_id: string | null
          shopify_order_id: string
          shopify_order_name: string | null
          shopify_order_number: string | null
          shopify_processed_at: string | null
          shopify_updated_at: string | null
          subtotal_price: number | null
          tags: string[] | null
          total_discounts: number | null
          total_price: number | null
          total_quantity: number | null
          total_shipping: number | null
          total_tax: number | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_last_name?: string | null
          financial_status?:
            | Database["public"]["Enums"]["shopify_financial_status"]
            | null
          first_synced_at?: string
          fulfillment_status?:
            | Database["public"]["Enums"]["shopify_fulfillment_status"]
            | null
          id?: string
          last_synced_at?: string
          line_item_count?: number | null
          note?: string | null
          order_status?:
            | Database["public"]["Enums"]["shopify_order_status"]
            | null
          organization_id: string
          raw_payload?: Json | null
          shopify_cancelled_at?: string | null
          shopify_created_at?: string | null
          shopify_customer_id?: string | null
          shopify_order_id: string
          shopify_order_name?: string | null
          shopify_order_number?: string | null
          shopify_processed_at?: string | null
          shopify_updated_at?: string | null
          subtotal_price?: number | null
          tags?: string[] | null
          total_discounts?: number | null
          total_price?: number | null
          total_quantity?: number | null
          total_shipping?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_last_name?: string | null
          financial_status?:
            | Database["public"]["Enums"]["shopify_financial_status"]
            | null
          first_synced_at?: string
          fulfillment_status?:
            | Database["public"]["Enums"]["shopify_fulfillment_status"]
            | null
          id?: string
          last_synced_at?: string
          line_item_count?: number | null
          note?: string | null
          order_status?:
            | Database["public"]["Enums"]["shopify_order_status"]
            | null
          organization_id?: string
          raw_payload?: Json | null
          shopify_cancelled_at?: string | null
          shopify_created_at?: string | null
          shopify_customer_id?: string | null
          shopify_order_id?: string
          shopify_order_name?: string | null
          shopify_order_number?: string | null
          shopify_processed_at?: string | null
          shopify_updated_at?: string | null
          subtotal_price?: number | null
          tags?: string[] | null
          total_discounts?: number | null
          total_price?: number | null
          total_quantity?: number | null
          total_shipping?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_sync_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          cursor: string | null
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          metadata: Json
          organization_id: string
          records_created: number | null
          records_examined: number | null
          records_failed: number | null
          records_skipped: number | null
          records_updated: number | null
          started_at: string
          status: Database["public"]["Enums"]["shopify_sync_run_status"]
          sync_type: Database["public"]["Enums"]["shopify_sync_type"]
          trigger_source: string | null
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cursor?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          records_created?: number | null
          records_examined?: number | null
          records_failed?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["shopify_sync_run_status"]
          sync_type: Database["public"]["Enums"]["shopify_sync_type"]
          trigger_source?: string | null
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cursor?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          records_created?: number | null
          records_examined?: number | null
          records_failed?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["shopify_sync_run_status"]
          sync_type?: Database["public"]["Enums"]["shopify_sync_type"]
          trigger_source?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_sync_logs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_sync_queue: {
        Row: {
          attempts: number
          changes: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          changes?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          changes?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_sync_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_sync_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_webhooks: {
        Row: {
          created_at: string
          error_details: Json | null
          error_message: string | null
          event: Database["public"]["Enums"]["shopify_webhook_event"]
          headers: Json | null
          id: string
          organization_id: string
          payload: Json | null
          processed_at: string | null
          received_at: string
          retry_count: number
          shopify_resource_id: string | null
          shopify_topic: string
          shopify_webhook_id: string | null
          status: Database["public"]["Enums"]["shopify_webhook_status"]
          sync_log_id: string | null
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          event: Database["public"]["Enums"]["shopify_webhook_event"]
          headers?: Json | null
          id?: string
          organization_id: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          retry_count?: number
          shopify_resource_id?: string | null
          shopify_topic: string
          shopify_webhook_id?: string | null
          status?: Database["public"]["Enums"]["shopify_webhook_status"]
          sync_log_id?: string | null
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          event?: Database["public"]["Enums"]["shopify_webhook_event"]
          headers?: Json | null
          id?: string
          organization_id?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          retry_count?: number
          shopify_resource_id?: string | null
          shopify_topic?: string
          shopify_webhook_id?: string | null
          status?: Database["public"]["Enums"]["shopify_webhook_status"]
          sync_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_webhooks_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "shopify_sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      size_distribution_curves: {
        Row: {
          created_at: string
          curve: Json
          id: string
          is_default: boolean
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          curve: Json
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          curve?: Json
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tags: {
        Row: {
          category: Database["public"]["Enums"]["tag_category"]
          created_at: string
          id: string
          name: string
          organization_id: string
          slug: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["tag_category"]
          created_at?: string
          id?: string
          name: string
          organization_id: string
          slug: string
        }
        Update: {
          category?: Database["public"]["Enums"]["tag_category"]
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          athlete_id: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          organization_id: string
          start_date: string | null
          team_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          start_date?: string | null
          team_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          start_date?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "team_memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "team_memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_revenue_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          city: string | null
          created_at: string
          id: string
          league: Database["public"]["Enums"]["league_type"] | null
          metadata: Json
          name: string
          notes: string | null
          organization_id: string
          primary_color: string | null
          secondary_color: string | null
          shopify_tag: string | null
          slug: string
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          league?: Database["public"]["Enums"]["league_type"] | null
          metadata?: Json
          name: string
          notes?: string | null
          organization_id: string
          primary_color?: string | null
          secondary_color?: string | null
          shopify_tag?: string | null
          slug: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          league?: Database["public"]["Enums"]["league_type"] | null
          metadata?: Json
          name?: string
          notes?: string | null
          organization_id?: string
          primary_color?: string | null
          secondary_color?: string | null
          shopify_tag?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      user_athlete_links: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_athlete_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_monthly"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "user_athlete_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_revenue_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "user_athlete_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_athlete_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_platform_admin: boolean
          organization_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          organization_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          organization_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      volume_discount_breaks: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          label: string | null
          max_units: number | null
          min_units: number
          pricing_tier_id: string | null
        }
        Insert: {
          created_at?: string
          discount_percent: number
          id?: string
          label?: string | null
          max_units?: number | null
          min_units: number
          pricing_tier_id?: string | null
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          label?: string | null
          max_units?: number | null
          min_units?: number
          pricing_tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volume_discount_breaks_pricing_tier_id_fkey"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      volume_discount_tiers: {
        Row: {
          created_at: string
          discount_pct: number
          id: string
          min_qty: number
          organization_id: string
        }
        Insert: {
          created_at?: string
          discount_pct: number
          id?: string
          min_qty: number
          organization_id: string
        }
        Update: {
          created_at?: string
          discount_pct?: number
          id?: string
          min_qty?: number
          organization_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      athlete_revenue_monthly: {
        Row: {
          athlete_id: string | null
          month: string | null
          orders: number | null
          organization_id: string | null
          revenue: number | null
          units: number | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_revenue_summary: {
        Row: {
          athlete_id: string | null
          athlete_name: string | null
          first_order_at: string | null
          gross_revenue: number | null
          last_order_at: string | null
          order_count: number | null
          organization_id: string | null
          units_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations_safe: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          shopify_connected: boolean | null
          shopify_connected_at: string | null
          shopify_last_sync_at: string | null
          shopify_shop_domain: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          shopify_connected?: boolean | null
          shopify_connected_at?: string | null
          shopify_last_sync_at?: string | null
          shopify_shop_domain?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          shopify_connected?: boolean | null
          shopify_connected_at?: string | null
          shopify_last_sync_at?: string | null
          shopify_shop_domain?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_revenue_summary: {
        Row: {
          first_order_at: string | null
          gross_revenue: number | null
          last_order_at: string | null
          order_count: number | null
          organization_id: string | null
          team_id: string | null
          team_name: string | null
          units_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      compute_wholesale_price: {
        Args: {
          _organization_id: string
          _product_id: string
          _unit_count: number
        }
        Returns: {
          margin_per_unit: number
          margin_percent: number
          pricing_incomplete: boolean
          tier_moq_price: number
          tier_name: string
          true_cost: number
          unit_price: number
          volume_break_label: string
          volume_modifier_percent: number
        }[]
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      current_user_is_platform_admin: { Args: never; Returns: boolean }
      current_user_org_id: { Args: never; Returns: string }
      is_org_accessible: { Args: { _org_id: string }; Returns: boolean }
    }
    Enums: {
      athlete_role: "primary" | "featured" | "collab"
      athlete_status: "active" | "inactive" | "archived"
      blank_availability:
        | "in_stock"
        | "low_stock"
        | "out_of_stock"
        | "discontinued"
        | "preorder"
      bulk_order_status:
        | "submitted"
        | "acknowledged"
        | "in_production"
        | "ready"
        | "shipped"
        | "completed"
        | "cancelled"
      collection_type:
        | "athlete"
        | "team"
        | "season"
        | "campaign"
        | "capsule"
        | "other"
      design_file_type: "source" | "export" | "mockup" | "backup" | "reference"
      design_placement:
        | "front"
        | "back"
        | "left_sleeve"
        | "right_sleeve"
        | "hem"
        | "chest"
        | "pocket"
        | "hood"
        | "sleeve_wrap"
        | "all_over"
        | "other"
      design_status:
        | "concept"
        | "in_progress"
        | "approved"
        | "production_ready"
        | "archived"
      garment_type:
        | "tee"
        | "long_sleeve"
        | "hoodie"
        | "crewneck"
        | "zip_hoodie"
        | "tank"
        | "polo"
        | "jersey"
        | "shorts"
        | "sweatpants"
        | "hat"
        | "beanie"
        | "other"
      ingestion_status:
        | "pending"
        | "processing"
        | "review"
        | "applied"
        | "failed"
        | "cancelled"
      league_type:
        | "NFL"
        | "NBA"
        | "MLB"
        | "NHL"
        | "MLS"
        | "WNBA"
        | "NCAA"
        | "OTHER"
      product_status:
        | "draft"
        | "internal"
        | "published"
        | "archived"
        | "needs_review"
      product_type:
        | "athlete_merch"
        | "team_merch"
        | "blank_bulk"
        | "pod"
        | "other"
      shopify_financial_status:
        | "pending"
        | "authorized"
        | "partially_paid"
        | "paid"
        | "partially_refunded"
        | "refunded"
        | "voided"
        | "unknown"
      shopify_fulfillment_status:
        | "fulfilled"
        | "partial"
        | "unfulfilled"
        | "restocked"
        | "unknown"
      shopify_order_status: "open" | "closed" | "cancelled" | "unknown"
      shopify_sync_run_status:
        | "running"
        | "success"
        | "partial_success"
        | "failed"
      shopify_sync_status:
        | "not_synced"
        | "pending"
        | "synced"
        | "out_of_sync"
        | "error"
      shopify_sync_type:
        | "products_full"
        | "products_delta"
        | "product_single"
        | "orders_full"
        | "orders_delta"
        | "order_single"
        | "webhook_processed"
        | "reconciliation"
      shopify_webhook_event:
        | "products/create"
        | "products/update"
        | "products/delete"
        | "orders/create"
        | "orders/updated"
        | "orders/paid"
        | "orders/fulfilled"
        | "orders/cancelled"
        | "orders/partially_fulfilled"
        | "inventory_levels/update"
        | "other"
      shopify_webhook_status:
        | "received"
        | "processing"
        | "processed"
        | "failed"
        | "replayed"
      split_basis: "product" | "collection" | "athlete_global"
      tag_category:
        | "style"
        | "theme"
        | "campaign"
        | "shopify"
        | "internal"
        | "other"
      team_status: "active" | "inactive" | "archived"
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
      athlete_role: ["primary", "featured", "collab"],
      athlete_status: ["active", "inactive", "archived"],
      blank_availability: [
        "in_stock",
        "low_stock",
        "out_of_stock",
        "discontinued",
        "preorder",
      ],
      bulk_order_status: [
        "submitted",
        "acknowledged",
        "in_production",
        "ready",
        "shipped",
        "completed",
        "cancelled",
      ],
      collection_type: [
        "athlete",
        "team",
        "season",
        "campaign",
        "capsule",
        "other",
      ],
      design_file_type: ["source", "export", "mockup", "backup", "reference"],
      design_placement: [
        "front",
        "back",
        "left_sleeve",
        "right_sleeve",
        "hem",
        "chest",
        "pocket",
        "hood",
        "sleeve_wrap",
        "all_over",
        "other",
      ],
      design_status: [
        "concept",
        "in_progress",
        "approved",
        "production_ready",
        "archived",
      ],
      garment_type: [
        "tee",
        "long_sleeve",
        "hoodie",
        "crewneck",
        "zip_hoodie",
        "tank",
        "polo",
        "jersey",
        "shorts",
        "sweatpants",
        "hat",
        "beanie",
        "other",
      ],
      ingestion_status: [
        "pending",
        "processing",
        "review",
        "applied",
        "failed",
        "cancelled",
      ],
      league_type: ["NFL", "NBA", "MLB", "NHL", "MLS", "WNBA", "NCAA", "OTHER"],
      product_status: [
        "draft",
        "internal",
        "published",
        "archived",
        "needs_review",
      ],
      product_type: [
        "athlete_merch",
        "team_merch",
        "blank_bulk",
        "pod",
        "other",
      ],
      shopify_financial_status: [
        "pending",
        "authorized",
        "partially_paid",
        "paid",
        "partially_refunded",
        "refunded",
        "voided",
        "unknown",
      ],
      shopify_fulfillment_status: [
        "fulfilled",
        "partial",
        "unfulfilled",
        "restocked",
        "unknown",
      ],
      shopify_order_status: ["open", "closed", "cancelled", "unknown"],
      shopify_sync_run_status: [
        "running",
        "success",
        "partial_success",
        "failed",
      ],
      shopify_sync_status: [
        "not_synced",
        "pending",
        "synced",
        "out_of_sync",
        "error",
      ],
      shopify_sync_type: [
        "products_full",
        "products_delta",
        "product_single",
        "orders_full",
        "orders_delta",
        "order_single",
        "webhook_processed",
        "reconciliation",
      ],
      shopify_webhook_event: [
        "products/create",
        "products/update",
        "products/delete",
        "orders/create",
        "orders/updated",
        "orders/paid",
        "orders/fulfilled",
        "orders/cancelled",
        "orders/partially_fulfilled",
        "inventory_levels/update",
        "other",
      ],
      shopify_webhook_status: [
        "received",
        "processing",
        "processed",
        "failed",
        "replayed",
      ],
      split_basis: ["product", "collection", "athlete_global"],
      tag_category: [
        "style",
        "theme",
        "campaign",
        "shopify",
        "internal",
        "other",
      ],
      team_status: ["active", "inactive", "archived"],
    },
  },
} as const
