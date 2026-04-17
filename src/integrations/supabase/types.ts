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
          slug?: string
          status?: Database["public"]["Enums"]["athlete_status"]
          updated_at?: string
        }
        Relationships: [
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
          availability_status: Database["public"]["Enums"]["blank_availability"]
          brand: string | null
          cost: number | null
          created_at: string
          fabric_specs: Json
          garment_type: Database["public"]["Enums"]["garment_type"]
          id: string
          internal_only: boolean
          metadata: Json
          moq: number | null
          name: string
          notes: string | null
          organization_id: string
          sellable_as_blank: boolean
          slug: string
          style_number: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          availability_status?: Database["public"]["Enums"]["blank_availability"]
          brand?: string | null
          cost?: number | null
          created_at?: string
          fabric_specs?: Json
          garment_type?: Database["public"]["Enums"]["garment_type"]
          id?: string
          internal_only?: boolean
          metadata?: Json
          moq?: number | null
          name: string
          notes?: string | null
          organization_id: string
          sellable_as_blank?: boolean
          slug: string
          style_number?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          availability_status?: Database["public"]["Enums"]["blank_availability"]
          brand?: string | null
          cost?: number | null
          created_at?: string
          fabric_specs?: Json
          garment_type?: Database["public"]["Enums"]["garment_type"]
          id?: string
          internal_only?: boolean
          metadata?: Json
          moq?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          sellable_as_blank?: boolean
          slug?: string
          style_number?: string | null
          updated_at?: string
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
        ]
      }
      bulk_order_items: {
        Row: {
          color: string | null
          created_at: string
          id: string
          notes: string | null
          order_request_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          size: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_request_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          size: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_request_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          size?: string
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
          shipped_at: string | null
          shipping_carrier: string | null
          status: Database["public"]["Enums"]["bulk_order_status"]
          team_id: string | null
          total_units: number
          tracking_number: string | null
          updated_at: string
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
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: Database["public"]["Enums"]["bulk_order_status"]
          team_id?: string | null
          total_units?: number
          tracking_number?: string | null
          updated_at?: string
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
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: Database["public"]["Enums"]["bulk_order_status"]
          team_id?: string | null
          total_units?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
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
            referencedRelation: "teams"
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
            foreignKeyName: "designs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
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
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      product_designs: {
        Row: {
          created_at: string
          design_id: string
          id: string
          placement: Database["public"]["Enums"]["design_placement"]
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          design_id: string
          id?: string
          placement?: Database["public"]["Enums"]["design_placement"]
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          design_id?: string
          id?: string
          placement?: Database["public"]["Enums"]["design_placement"]
          product_id?: string
          sort_order?: number
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
            referencedRelation: "teams"
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
        }
        Insert: {
          ai_confidence_score?: number | null
          blank_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
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
        }
        Update: {
          ai_confidence_score?: number | null
          blank_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
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
            foreignKeyName: "revenue_splits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organization_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_is_admin: { Args: never; Returns: boolean }
      current_user_org_id: { Args: never; Returns: string }
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
      shopify_sync_status:
        | "not_synced"
        | "pending"
        | "synced"
        | "out_of_sync"
        | "error"
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
      shopify_sync_status: [
        "not_synced",
        "pending",
        "synced",
        "out_of_sync",
        "error",
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
