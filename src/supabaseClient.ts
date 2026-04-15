"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qqgisofjwbsztlbduywf.supabase.co";
const supabaseAnonKey = "sb_publishable_3IePG4ynZ64CmgZWBk9FEQ_81Urvrrs";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);