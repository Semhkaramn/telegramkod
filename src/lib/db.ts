import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL || "");

export { sql };

// Types
export interface Channel {
  channel_id: number;
  paused: number;
  channel_name?: string;
}

export interface ChannelAdmin {
  channel_id: number;
  admin_id: number;
  admin_username: string | null;
  admin_type: string;
}

export interface ListeningChannel {
  channel_id: number;
  keyword: string;
  default_link: string;
  type: string;
  triggers: string;
}

export interface AdminLink {
  admin_id: number;
  channel_id: number;
  link_code: string;
  link_url: string;
  created_at: string;
}

export interface ChannelStats {
  channel_id: number;
  stat_date: string;
  daily_count: number;
  code_list: string;
  last_updated: string;
}

export interface Keyword {
  id: number;
  keyword: string;
}

export interface BannedWord {
  id: number;
  word: string;
}

// Database functions
export async function getAllChannels(): Promise<Channel[]> {
  const rows = await sql`SELECT channel_id, paused FROM channels ORDER BY channel_id`;
  return rows as Channel[];
}

export async function getChannel(channelId: number): Promise<Channel | null> {
  const rows = await sql`SELECT channel_id, paused FROM channels WHERE channel_id = ${channelId}`;
  return rows[0] as Channel || null;
}

export async function addChannel(channelId: number): Promise<void> {
  await sql`INSERT INTO channels (channel_id) VALUES (${channelId}) ON CONFLICT (channel_id) DO NOTHING`;
}

export async function removeChannel(channelId: number): Promise<void> {
  await sql`DELETE FROM channel_admins WHERE channel_id = ${channelId}`;
  await sql`DELETE FROM custom_links WHERE target_channel_id = ${channelId}`;
  await sql`DELETE FROM admin_links WHERE channel_id = ${channelId}`;
  await sql`DELETE FROM channel_stats WHERE channel_id = ${channelId}`;
  await sql`DELETE FROM channels WHERE channel_id = ${channelId}`;
}

export async function setChannelPause(channelId: number, paused: boolean): Promise<void> {
  await sql`UPDATE channels SET paused = ${paused ? 1 : 0} WHERE channel_id = ${channelId}`;
}

// Channel Admins
export async function getChannelAdmins(channelId: number): Promise<ChannelAdmin[]> {
  const rows = await sql`SELECT admin_id, admin_username, admin_type FROM channel_admins WHERE channel_id = ${channelId}`;
  return rows.map(r => ({ ...r, channel_id: channelId })) as ChannelAdmin[];
}

export async function getAllAdmins(): Promise<ChannelAdmin[]> {
  const rows = await sql`SELECT channel_id, admin_id, admin_username, admin_type FROM channel_admins ORDER BY channel_id`;
  return rows as ChannelAdmin[];
}

export async function addAdmin(channelId: number, adminId: number, adminUsername: string | null, adminType: string = 'ana'): Promise<void> {
  await sql`INSERT INTO channels (channel_id) VALUES (${channelId}) ON CONFLICT (channel_id) DO NOTHING`;
  await sql`
    INSERT INTO channel_admins (channel_id, admin_id, admin_username, admin_type)
    VALUES (${channelId}, ${adminId}, ${adminUsername}, ${adminType})
    ON CONFLICT (channel_id, admin_id) DO UPDATE SET
    admin_username = ${adminUsername}, admin_type = ${adminType}
  `;
}

export async function removeAdmin(channelId: number, adminId: number): Promise<void> {
  await sql`DELETE FROM channel_admins WHERE channel_id = ${channelId} AND admin_id = ${adminId}`;
}

// Listening Channels
export async function getListeningChannels(): Promise<ListeningChannel[]> {
  const rows = await sql`SELECT channel_id, keyword, default_link, type, triggers FROM listening_channels ORDER BY channel_id`;
  return rows as ListeningChannel[];
}

export async function addListeningChannel(channelId: number, defaultLink: string = 'https://example.com'): Promise<void> {
  await sql`
    INSERT INTO listening_channels (channel_id, keyword, default_link, type)
    VALUES (${channelId}, '', ${defaultLink}, 'text')
    ON CONFLICT (channel_id) DO UPDATE SET
    keyword = '', default_link = ${defaultLink}, type = 'text'
  `;
}

export async function removeListeningChannel(channelId: number): Promise<void> {
  await sql`DELETE FROM custom_links WHERE listening_channel_id = ${channelId}`;
  await sql`DELETE FROM listening_channels WHERE channel_id = ${channelId}`;
}

// Keywords
export async function getAllKeywords(): Promise<Keyword[]> {
  const rows = await sql`SELECT id, keyword FROM keywords ORDER BY keyword`;
  return rows as Keyword[];
}

export async function addKeyword(keyword: string): Promise<void> {
  await sql`INSERT INTO keywords (keyword) VALUES (${keyword.toLowerCase()}) ON CONFLICT DO NOTHING`;
}

export async function removeKeyword(keyword: string): Promise<void> {
  await sql`DELETE FROM keywords WHERE keyword = ${keyword.toLowerCase()}`;
}

// Banned Words
export async function getAllBannedWords(): Promise<BannedWord[]> {
  const rows = await sql`SELECT id, word FROM banned_words ORDER BY word`;
  return rows as BannedWord[];
}

export async function addBannedWord(word: string): Promise<void> {
  await sql`INSERT INTO banned_words (word) VALUES (${word.toLowerCase()}) ON CONFLICT DO NOTHING`;
}

export async function removeBannedWord(word: string): Promise<void> {
  await sql`DELETE FROM banned_words WHERE word = ${word.toLowerCase()}`;
}

// Admin Links
export async function getAdminLinks(adminId: number, channelId?: number): Promise<AdminLink[]> {
  if (channelId) {
    const rows = await sql`SELECT admin_id, channel_id, link_code, link_url, created_at FROM admin_links WHERE admin_id = ${adminId} AND channel_id = ${channelId} ORDER BY link_code`;
    return rows as AdminLink[];
  }
  const rows = await sql`SELECT admin_id, channel_id, link_code, link_url, created_at FROM admin_links WHERE admin_id = ${adminId} ORDER BY channel_id, link_code`;
  return rows as AdminLink[];
}

export async function addAdminLink(adminId: number, channelId: number, linkCode: string, linkUrl: string): Promise<void> {
  await sql`
    INSERT INTO admin_links (admin_id, channel_id, link_code, link_url)
    VALUES (${adminId}, ${channelId}, ${linkCode}, ${linkUrl})
    ON CONFLICT (admin_id, channel_id, link_code) DO UPDATE SET
    link_url = ${linkUrl}
  `;
}

export async function removeAdminLink(adminId: number, channelId: number, linkCode: string): Promise<void> {
  await sql`DELETE FROM admin_links WHERE admin_id = ${adminId} AND channel_id = ${channelId} AND link_code = ${linkCode}`;
}

// Statistics
export async function getDailyStats(channelId: number): Promise<{ daily_count: number; code_list: string }> {
  const today = new Date().toISOString().split('T')[0];
  const rows = await sql`SELECT daily_count, code_list FROM channel_stats WHERE channel_id = ${channelId} AND stat_date = ${today}`;
  return rows[0] as { daily_count: number; code_list: string } || { daily_count: 0, code_list: '' };
}

export async function getWeeklyStats(channelId: number): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rows = await sql`SELECT COALESCE(SUM(daily_count), 0) as total FROM channel_stats WHERE channel_id = ${channelId} AND stat_date > ${weekAgo}`;
  return Number(rows[0]?.total) || 0;
}

export async function getMonthlyStats(channelId: number): Promise<number> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rows = await sql`SELECT COALESCE(SUM(daily_count), 0) as total FROM channel_stats WHERE channel_id = ${channelId} AND stat_date > ${monthAgo}`;
  return Number(rows[0]?.total) || 0;
}

export async function getTotalStats(): Promise<{ daily: number; weekly: number; monthly: number }> {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const dailyRows = await sql`SELECT COALESCE(SUM(daily_count), 0) as total FROM channel_stats WHERE stat_date = ${today}`;
  const weeklyRows = await sql`SELECT COALESCE(SUM(daily_count), 0) as total FROM channel_stats WHERE stat_date > ${weekAgo}`;
  const monthlyRows = await sql`SELECT COALESCE(SUM(daily_count), 0) as total FROM channel_stats WHERE stat_date > ${monthAgo}`;

  return {
    daily: Number(dailyRows[0]?.total) || 0,
    weekly: Number(weeklyRows[0]?.total) || 0,
    monthly: Number(monthlyRows[0]?.total) || 0,
  };
}
