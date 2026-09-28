// Which tables and columns the admin MCP server's SQL tool may see (#292), with what each means in glossary terms
// (CONTEXT.md) for describe_schema.
//
// Every table in the Drizzle schema and the session store's table is listed here, and every column of an allowed
// table, each either allowed (with a note, "" for none) or denied. classification.test.ts fails on anything missing,
// so a migration can't put a secret in front of the tool by default. The replica (replica.ts) keeps only what's
// allowed: denied and unlisted tables and columns never reach it.

export interface Denied {
  denied: string;
}

/** A denied column, with why. */
export const deny = (why: string): Denied => ({ denied: why });

export type ColumnClass = string | Denied;

export type TableClass = { denied: string } | { note: string; columns: Record<string, ColumnClass> };

export const isDenied = (c: ColumnClass | TableClass): c is Denied | { denied: string } => typeof c === "object" && "denied" in c;

const TS = "unix seconds";

export const SQL_TABLES: Record<string, TableClass> = {
  // ---- denied outright -------------------------------------------------------------------------------------------
  sessions: { denied: "The login session store (better-sqlite3-session-store): a session id takes over a login." },
  phone_login_links: { denied: "Phone login link token hashes." },
  pick_ratings: { denied: "Captains' private ratings and notes on signups (Pick Rating)." },
  oauth_clients: { denied: "The MCP server's own OAuth apps and their secrets." },
  oauth_codes: { denied: "OAuth authorization codes." },
  oauth_tokens: { denied: "OAuth token hashes." },

  // ---- identity & platform ---------------------------------------------------------------------------------------
  users: {
    note: "Every account that has logged in (Discord). Inside a Bingo a Player is named by signups.rsn, not by these Discord names.",
    columns: {
      id: "",
      discord_id: "Discord user id",
      discord_username: "",
      discord_global_name: "Discord display name",
      discord_guild_nick: "Nickname in the clan's Discord server",
      discord_avatar: "",
      in_guild: "Was in the clan's Discord server at their last login (0/1)",
      is_admin: "Site Admin (0/1)",
      created_at: TS,
      updated_at: TS,
    },
  },
  bingos: {
    note: "One Bingo. stage: planning (Planning), signup (Signups open), captains (Signups closed), draft (Draft), reveal (Board revealed), live (Live), complete (Finished).",
    columns: {
      id: "",
      slug: "What list_bingos and the curated tools take",
      name: "",
      description: "",
      theme: "",
      stage: "",
      board_rows: "",
      board_cols: "",
      signup_mode: "solo or duo",
      leftover_mode: "Unused (replaced by cut_mode)",
      cut_mode: "even, pairs_only or none",
      warn_leftovers: "",
      buyin_amount: "GP per Player (Buy-in)",
      bonus_pot_amount: "GP added to the Pot on top of Buy-ins",
      rules_markdown: "",
      exclusivity_rules_json: "Exclusive Item rules, JSON",
      signup_opens_at: TS,
      draft_scheduled_at: TS,
      reveal_scheduled_at: TS,
      starts_at: `Scheduled start, ${TS}; stage_transitions has when it actually went live`,
      ends_at: TS,
      wom_enabled: "",
      wom_group_id: "",
      wom_group_verification_code: deny("Authorizes editing the Bingo's Wise Old Man group."),
      wom_competition_id: "",
      wom_sync_error: "",
      wom_bulk_update_sent_at: TS,
      draft_started: "",
      draft_order_locked_until: TS,
      cut_review_fingerprint: "",
      created_by_user_id: "",
      created_at: TS,
      achievements_enabled: "",
      sealed_tiles: "",
      hide_rules: "",
      show_screenshots_when_finished: "",
      publish_wrapped_on_finish: "",
      wrapped_credits_json: "Unused",
      wrapped_art_credits_json: "",
    },
  },
  bingo_moderators: {
    note: "Moderators of a Bingo (Site Admins moderate every Bingo without a row here).",
    columns: { id: "", bingo_id: "", user_id: "", created_at: TS },
  },
  stage_transitions: {
    note: "Every stage change of a Bingo, with who made it. The move to live is when the Bingo actually started; to complete, when it ended.",
    columns: { id: "", bingo_id: "", from_stage: "", to_stage: "", changed_by_user_id: "", created_at: TS },
  },
  audit_log: {
    note: "Append-only log of every change made on the site (the Audit log). created_at is in unix MILLISECONDS here, unlike every other table.",
    columns: {
      id: "Increasing insertion order",
      bingo_id: "Null for site-level entries",
      request_id: "",
      action: "e.g. submission.approved, stage.changed, mcp.tool_called",
      visibility: "mods, team or public",
      actor_type: "user, system or dev",
      actor_role: "admin, mod, player or system",
      actor_user_id: "Who did it",
      on_behalf_of_user_id: "The Player a teammate or Moderator acted for",
      entity_type: "",
      entity_id: "",
      entity_label: "",
      team_id: "",
      details: "JSON",
      created_at: "unix milliseconds",
    },
  },

  // ---- signups & draft -------------------------------------------------------------------------------------------
  signup_questions: {
    note: "A Bingo's signup form questions.",
    columns: {
      id: "",
      bingo_id: "",
      prompt: "",
      helper_text: "",
      type: "text, textarea, select, multiselect, boolean or member",
      options_json: "",
      allow_other: "",
      multiple_picks: "",
      max_picks: "",
      required: "",
      sort_order: "",
      visibility: "Who sees the answers: captains, mods or admins",
    },
  },
  signups: {
    note: "A Signup: one person's entry into one Bingo. A withdrawn signup is never a Player; from Board revealed on, the Players are team_members.",
    columns: {
      id: "",
      bingo_id: "",
      user_id: "",
      rsn: "The RSN they signed up with: how a Player is named inside a Bingo",
      timezone: "IANA zone",
      wom_id: "",
      rsn_verified: "",
      wom_data_json: "Raw Wise Old Man player response at signup (large)",
      rune_profile_data_json: "Raw RuneProfile response at signup (large)",
      stats_fetched_at: TS,
      ca_current_json: "Combat Achievement tier and points, JSON",
      ca_peak_json: "",
      status: "active or withdrawn",
      buyin_received_at: TS,
      buyin_collected_by_user_id: "",
      buyin_recorded_by_user_id: "",
      created_at: TS,
    },
  },
  signup_answers: {
    note: "Answers to signup_questions.",
    columns: { id: "", signup_id: "", question_id: "", value: "Booleans as 'true'/'false'; multiselect and member picks as JSON" },
  },
  signup_pairings: {
    note: "Duo partner requests. A pair is a row with status accepted.",
    columns: {
      id: "",
      bingo_id: "",
      requester_user_id: "",
      target_discord_id: "Discord id of the requested partner",
      status: "pending, accepted, declined, cancelled, dissolved or left",
      created_by_user_id: "",
      created_at: TS,
      responded_at: TS,
    },
  },
  teams: {
    note: "A Team in a Bingo.",
    columns: {
      id: "",
      bingo_id: "",
      captain_user_id: "",
      name: "",
      codeword: "The Codeword shown in the Team's screenshots",
      color: "",
      draft_order: "",
      created_at: TS,
      updated_at: TS,
    },
  },
  team_members: {
    note: "Who is on each Team: the Players, from Board revealed on.",
    columns: { id: "", team_id: "", user_id: "", is_captain: "", is_co_captain: "", joined_at: TS },
  },
  superlative_categories: {
    note: "Superlative award categories of a Bingo (e.g. Team MVP).",
    columns: { id: "", bingo_id: "", name: "", sort_order: "" },
  },
  superlative_votes: {
    note: "Superlative votes: who each vote went to. Votes are secret, so the voter isn't here.",
    columns: {
      id: "",
      category_id: "",
      team_id: "The voter's Team",
      voter_user_id: deny("Votes are secret: nobody, Admins included, reads who voted for whom."),
      nominee_user_id: "",
      created_at: TS,
      updated_at: TS,
    },
  },
  draft_picks: {
    note: "The Draft, one row per drafted Player (a duo pick is two rows sharing pick_number).",
    columns: { id: "", bingo_id: "", pick_number: "1-based overall order", team_id: "", user_id: "The drafted Player", picked_by_user_id: "", created_at: TS },
  },
  tile_interests: {
    note: "Task interest: a Player's hand raised on a Task of a Tile, for their Team.",
    columns: { id: "", tile_id: "", task_id: "nodes.id of the Task", team_id: "", user_id: "", created_at: TS },
  },

  // ---- items -----------------------------------------------------------------------------------------------------
  item_groups: { note: "Item Groups: named, reusable sets of item names.", columns: { id: "", name: "", description: "" } },
  item_group_items: { note: "", columns: { id: "", group_id: "", item_name: "" } },

  // ---- Wise Old Man ----------------------------------------------------------------------------------------------
  wom_snapshots: {
    note: "Wise Old Man snapshots of each Player during a Bingo (EHB, EHP, clues, boss kill counts).",
    columns: { id: "", bingo_id: "", user_id: "", taken_at: TS, ehb: "", ehp: "", clues: "", boss_kills_json: "{ boss metric: kills }" },
  },
  wom_reads: {
    note: "Where each Player's snapshot reads stand.",
    columns: { id: "", bingo_id: "", user_id: "", rsn: "", read_at: TS, read_through: TS, last_error: "", last_error_at: TS },
  },
  wom_past_competitions: {
    note: "Final results of Wise Old Man competitions, kept after WOM's own record changes.",
    columns: {
      id: "",
      guild_id: "",
      wom_id: "",
      bingo_id: "Null for a competition added by hand",
      title: "",
      metric: "",
      starts_at: TS,
      ends_at: TS,
      participant_count: "",
      data_json: "Raw WOM competition response (large)",
      fetched_at: TS,
      added_by_user_id: "",
      created_at: TS,
    },
  },
  bug_reports: {
    note: "Bug reports from the site's header button.",
    columns: {
      id: "",
      bingo_id: "",
      reporter_user_id: "",
      description: "",
      page_url: "",
      user_agent: "",
      palette: "",
      status: "open, resolved or closed",
      resolved_by_user_id: "",
      resolved_at: TS,
      resolution_message: "",
      created_at: TS,
    },
  },

  // ---- the board -------------------------------------------------------------------------------------------------
  nodes: {
    note: "The Requirement Tree: every Tile, Part, Task, Item and Line is a node. A Tile's Parts are its node's children (node_edges); ITEM and MANUAL nodes are the leaves Claims go on. points are awarded once when a node completes.",
    columns: {
      id: "",
      bingo_id: "",
      kind: "ALL, ANY, COUNT, SUM (composites), ITEM, MANUAL (leaves)",
      label: "",
      description: "",
      notes: "",
      points: "Points the node awards when it completes",
      min_count: "COUNT only",
      quantity: "SUM only: target total quantity",
      item_name: "ITEM only",
      points_gate_node_id: "Points stay 0 until this node completes too",
      submit_gate_node_id: "Submissions are refused until this node completes",
      allows_pre_load: "",
      valued_as_item_name: "Valued as",
      valued_as_divisor: "",
      valued_as_source: "",
    },
  },
  node_edges: {
    note: "Parent → child links of the Requirement Tree (a node can have several parents, e.g. a Tile in a row and a column Line).",
    columns: { id: "", parent_id: "", child_id: "", sort_order: "" },
  },
  tile_categories: { note: "Categories of a Bingo's Tiles.", columns: { id: "", bingo_id: "", label: "", color_hex: "", sort_order: "" } },
  tiles: {
    note: "A Tile: a cell of the Board around one node.",
    columns: {
      id: "",
      bingo_id: "",
      node_id: "The Tile's root node",
      name: "",
      image_url: "",
      category_id: "",
      board_row: "0-indexed",
      board_col: "0-indexed",
      has_freeze_period: "",
      freeze_duration_minutes: "",
      notes: "",
      created_at: TS,
    },
  },
  bingo_lines: {
    note: "Lines (rows, columns, diagonals): each wraps a node whose children are its Tiles' nodes and whose points are the Line bonus.",
    columns: { id: "", bingo_id: "", node_id: "", line_type: "row, column, diagonal or custom", line_index: "" },
  },

  // ---- progress & submissions ------------------------------------------------------------------------------------
  team_node_state: {
    note: "Nodes each Team has completed, rebuilt on every review, with the points each completion awarded. Use bingo_summary for Team scores rather than summing these.",
    columns: { id: "", team_id: "", node_id: "", completed_at: TS, points_awarded: "" },
  },
  submissions: {
    note: "A Submission: screenshots plus Claims, reviewed by a Moderator. Points are never stored on it.",
    columns: {
      id: "",
      team_id: "",
      submitted_by_user_id: "The Player the drop is credited to",
      posted_by_user_id: "Set only when someone else uploaded it for that Player",
      status: "pending, approved or rejected",
      submitted_at: TS,
      reviewed_at: TS,
      reviewed_by_user_id: "The Moderator who reviewed it",
      reviewer_notes: "",
      created_at: TS,
      updated_at: TS,
    },
  },
  submission_reactions: {
    note: "Reactions: teammates' emoji on a Submission.",
    columns: { id: "", submission_id: "", user_id: "", emoji: "", created_at: TS },
  },
  submission_screenshots: {
    note: "Screenshots of a Submission, with what OCR read from them.",
    columns: {
      id: "",
      submission_id: "",
      screenshot_type: "main, pre_screenshot, bank, collection_log or other",
      storage_url: "",
      scrape_status: "",
      extracted_text: "OCR text",
      codeword_verified: "",
      detected_item_name: "",
      scraped_at: TS,
      uploaded_at: TS,
    },
  },
  claims: {
    note: "Claims: one drop allocated to one leaf (ITEM or MANUAL node) within a Submission.",
    columns: { id: "", submission_id: "", node_id: "The leaf", item_name: "", quantity: "", gp_value: "GP value when submitted (unit price × quantity); never used for scoring" },
  },
  piece_values: {
    note: "Piece values: an item piece priced as its whole item ÷ divisor.",
    columns: { id: "", piece_item_name: "", whole_item_name: "", whole_quantity: "", divisor: "", created_by_user_id: "", created_at: TS, updated_at: TS },
  },
  piece_value_other_pieces: { note: "A Piece value's Other pieces.", columns: { id: "", piece_value_id: "", item_name: "", quantity: "" } },
  unvalued_item_dismissals: { note: "Items an Admin chose to leave without a GP value.", columns: { item_name: "", dismissed_by_user_id: "", created_at: TS } },
  site_settings: { note: "Site-wide settings, one JSON value per key (e.g. titles).", columns: { key: "", value_json: "", updated_by_user_id: "", updated_at: TS } },
  bingo_title_settings: { note: "A Finished Bingo's frozen Title settings.", columns: { bingo_id: "", settings_json: "", title_ids_json: "", frozen_at: TS } },
  bingo_wrapped: { note: "A Bingo's published Wrapped.", columns: { bingo_id: "", published_at: TS, published_by_user_id: "", data_json: "Large" } },
  player_wrapped: { note: "Each Player's Wrapped.", columns: { id: "", bingo_id: "", user_id: "", data_json: "Large" } },
  team_point_adjustments: {
    note: "Point Adjustments: manual grants (or, negative, deductions) of a Team's points, with a reason.",
    columns: { id: "", team_id: "", bingo_id: "", amount: "", reason: "", created_by_user_id: "", created_at: TS },
  },

  // ---- achievements & Wrapped art --------------------------------------------------------------------------------
  bingo_achievement_settings: {
    note: "Which Achievements are switched on in a Bingo.",
    columns: { id: "", bingo_id: "", achievement_key: "", enabled: "", first_switched_on_at: TS },
  },
  achievement_activity: {
    note: "Player actions Achievements count (posted, reacted, interest_marked, tile_opened, yama_opened, rules_opened, stats_opened), while Live.",
    columns: {
      id: "",
      bingo_id: "",
      user_id: "",
      kind: "",
      subject_id: "",
      tile_id: "",
      credited_user_id: "",
      team_id: "",
      local_date: "YYYY-MM-DD on the Player's device",
      local_hour: "0-23 on the Player's device",
      occurred_at: TS,
    },
  },
  achievement_earned: {
    note: "Achievements each Player earned.",
    columns: { id: "", bingo_id: "", user_id: "", achievement_key: "", earned_at: TS, popup_shown_at: TS },
  },
  wrapped_art: {
    note: "Wrapped art images.",
    columns: {
      id: "",
      bingo_id: "",
      section: "",
      sort_order: "",
      original_url: "",
      frame1_url: "",
      frame2_url: "",
      key_color: "",
      key_tolerance: "",
      key_softness: "",
      credit_name: "",
      credit_role: "",
      updated_at: TS,
    },
  },
};

/** The columns the replica keeps, by table: every allowed table and its allowed columns. */
export function allowedColumns(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [table, cls] of Object.entries(SQL_TABLES)) {
    if (isDenied(cls)) continue;
    out[table] = Object.entries(cls.columns).filter(([, c]) => !isDenied(c)).map(([name]) => name);
  }
  return out;
}
