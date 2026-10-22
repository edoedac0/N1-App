#include "core.h"

#define JSON_CAPACITY 8192
#define SHORT_CAPACITY 96
#define URL_CAPACITY 768

typedef struct {
  char id[4];
  char short_name[SHORT_CAPACITY];
  char url[URL_CAPACITY];
} Channel;

static char json[JSON_CAPACITY];
static Channel channels[3];
static int view, source_status, video_status, dark_theme, theme_focus;
static int home_focus, channel_focus, current_index, generation;
static int badge_visible, control_visible, playback_ready;
static int length, cursor;

static void copy_string(char *dst, const char *src, int cap) {
  int i = 0;
  while (src[i] && i < cap - 1) { dst[i] = src[i]; i++; }
  dst[i] = 0;
}
static int equal(const char *a, const char *b) {
  int i = 0;
  while (a[i] && b[i] && a[i] == b[i]) { i++; }
  return !a[i] && !b[i];
}
static int https(const char *value) {
  const char *prefix = "https://";
  int i;
  for (i = 0; prefix[i]; i++) { if (value[i] != prefix[i]) { return 0; } }
  return value[i] != 0;
}
static void whitespace(void) {
  while (cursor < length && (json[cursor] == ' ' || json[cursor] == '\n' || json[cursor] == '\r' || json[cursor] == '\t')) { cursor++; }
}
static int take(char c) {
  whitespace();
  if (cursor >= length || json[cursor] != c) { return 0; }
  cursor++;
  return 1;
}
static int hex(char c) {
  if (c >= '0' && c <= '9') { return c - '0'; }
  if (c >= 'a' && c <= 'f') { return c - 'a' + 10; }
  if (c >= 'A' && c <= 'F') { return c - 'A' + 10; }
  return -1;
}
static int append_utf8(char *out, int cap, int *used, int point) {
  if (point < 0x80) {
    if (*used + 1 >= cap) { return 0; }
    out[(*used)++] = (char)point;
  } else if (point < 0x800) {
    if (*used + 2 >= cap) { return 0; }
    out[(*used)++] = (char)(0xc0 | (point >> 6));
    out[(*used)++] = (char)(0x80 | (point & 63));
  } else {
    if (*used + 3 >= cap) { return 0; }
    out[(*used)++] = (char)(0xe0 | (point >> 12));
    out[(*used)++] = (char)(0x80 | ((point >> 6) & 63));
    out[(*used)++] = (char)(0x80 | (point & 63));
  }
  return 1;
}
static int string(char *out, int cap) {
  int used = 0;
  if (!take('"')) { return 0; }
  while (cursor < length) {
    unsigned char c = (unsigned char)json[cursor++];
    if (c == '"') { out[used] = 0; return 1; }
    if (c < 32) { return 0; }
    if (c == '\\') {
      int point, i;
      if (cursor >= length) { return 0; }
      c = (unsigned char)json[cursor++];
      if (c == 'u') {
        point = 0;
        for (i = 0; i < 4; i++) {
          int digit;
          if (cursor >= length || (digit = hex(json[cursor++])) < 0) { return 0; }
          point = (point << 4) | digit;
        }
        if (point >= 0xd800 && point <= 0xdfff) { return 0; }
        if (!append_utf8(out, cap, &used, point)) { return 0; }
        continue;
      }
      if (c == 'b') { c = '\b'; }
      else if (c == 'f') { c = '\f'; }
      else if (c == 'n') { c = '\n'; }
      else if (c == 'r') { c = '\r'; }
      else if (c == 't') { c = '\t'; }
      else if (c != '"' && c != '\\' && c != '/') { return 0; }
    }
    if (used + 1 >= cap) { return 0; }
    out[used++] = (char)c;
  }
  return 0;
}
static int skip_value(int depth);
static int skip_object(int depth) {
  char key[64];
  if (!take('{')) { return 0; }
  if (take('}')) { return 1; }
  do {
    if (!string(key, sizeof key) || !take(':') || !skip_value(depth + 1)) { return 0; }
    if (take('}')) { return 1; }
  } while (take(','));
  return 0;
}
static int skip_array(int depth) {
  if (!take('[')) { return 0; }
  if (take(']')) { return 1; }
  do {
    if (!skip_value(depth + 1)) { return 0; }
    if (take(']')) { return 1; }
  } while (take(','));
  return 0;
}
static int skip_value(int depth) {
  char discard[URL_CAPACITY];
  if (depth > 8) { return 0; }
  whitespace();
  if (cursor >= length) { return 0; }
  if (json[cursor] == '"') { return string(discard, sizeof discard); }
  if (json[cursor] == '{') { return skip_object(depth); }
  if (json[cursor] == '[') { return skip_array(depth); }
  if ((json[cursor] >= '0' && json[cursor] <= '9') || json[cursor] == '-') {
    do { cursor++; } while (cursor < length && ((json[cursor] >= '0' && json[cursor] <= '9') || json[cursor] == '.' || json[cursor] == 'e' || json[cursor] == 'E' || json[cursor] == '+' || json[cursor] == '-'));
    return 1;
  }
  if (json[cursor] == 't' || json[cursor] == 'f' || json[cursor] == 'n') {
    char initial = json[cursor];
    const char *word = initial == 't' ? "true" : initial == 'f' ? "false" : "null";
    int i;
    for (i = 0; word[i]; i++) { if (cursor >= length || json[cursor++] != word[i]) { return 0; } }
    return 1;
  }
  return 0;
}
static int parse_channel(Channel *item) {
  char key[64];
  int found = 0;
  item->id[0] = item->short_name[0] = item->url[0] = 0;
  if (!take('{')) { return 0; }
  if (take('}')) { return 0; }
  do {
    if (!string(key, sizeof key) || !take(':')) { return 0; }
    if (equal(key, "id")) { if (!string(item->id, sizeof item->id)) { return 0; } found |= 1; }
    else if (equal(key, "shortName")) { if (!string(item->short_name, sizeof item->short_name)) { return 0; } found |= 2; }
    else if (equal(key, "url")) { if (!string(item->url, sizeof item->url)) { return 0; } found |= 4; }
    else if (!skip_value(0)) { return 0; }
    if (take('}')) { return found == 7; }
  } while (take(','));
  return 0;
}
static int parse_channels(Channel out[3]) {
  char key[64];
  int count = 0, found = 0, i;
  if (!take('{')) { return 0; }
  if (take('}')) { return 0; }
  do {
    if (!string(key, sizeof key) || !take(':')) { return 0; }
    if (equal(key, "channels")) {
      if (found || !take('[')) { return 0; }
      found = 1;
      if (take(']')) { return 0; }
      do {
        if (count >= 3 || !parse_channel(&out[count])) { return 0; }
        count++;
        if (take(']')) { break; }
        if (!take(',')) { return 0; }
      } while (1);
    } else if (!skip_value(0)) { return 0; }
    if (take('}')) { break; }
    if (!take(',')) { return 0; }
  } while (1);
  whitespace();
  if (!found || count != 3 || cursor != length) { return 0; }
  for (i = 0; i < 3; i++) {
    const char *expected = i == 0 ? "ba" : i == 1 ? "hr" : "rs";
    if (!equal(out[i].id, expected) || !out[i].short_name[0] || !https(out[i].url)) { return 0; }
  }
  return 1;
}

static void stop_video(void) {
  generation++;
  badge_visible = control_visible = playback_ready = 0;
  host_stop();
}
static void render(void) { host_render(); }
static void show_channels(void) {
  if (view == N1_PLAYER) { stop_video(); }
  view = N1_CHANNELS;
  theme_focus = 0;
  channel_focus = current_index < 0 ? 0 : current_index;
  render();
}
static void start_channel(int index) {
  if (source_status != N1_SOURCE_READY || index < 0 || index > 2) { return; }
  if (view == N1_PLAYER) { stop_video(); }
  else { generation++; }
  current_index = index;
  view = N1_PLAYER;
  theme_focus = badge_visible = control_visible = playback_ready = 0;
  video_status = N1_VIDEO_LOADING;
  render();
  host_play(index, generation);
}
static void back(void) {
  if (view == N1_PLAYER) { show_channels(); }
  else if (view == N1_CHANNELS) { view = N1_HOME; theme_focus = 0; render(); }
  else { host_exit(); }
}
static void toggle_theme(void) {
  dark_theme = !dark_theme;
  host_save_theme(dark_theme);
  render();
}
static void pause_video(int mode) {
  int play;
  if (view != N1_PLAYER || !playback_ready || video_status == N1_VIDEO_LOADING || video_status == N1_VIDEO_ERROR) { return; }
  play = mode == 1 ? 1 : mode == 2 ? 0 : video_status == N1_VIDEO_PAUSED;
  if ((play && video_status == N1_VIDEO_PLAYING) || (!play && video_status == N1_VIDEO_PAUSED)) { return; }
  video_status = play ? N1_VIDEO_PLAYING : N1_VIDEO_PAUSED;
  control_visible = 1;
  render();
  host_pause(play, generation);
  if (play) { host_schedule(N1_TIMER_CONTROL, 1100, generation); }
}

void n1_init(int dark) {
  view = N1_HOME;
  source_status = N1_SOURCE_LOADING;
  video_status = N1_VIDEO_LOADING;
  dark_theme = !!dark;
  theme_focus = home_focus = channel_focus = 0;
  current_index = -1;
  generation = 0;
  badge_visible = control_visible = playback_ready = 0;
  render();
  host_fetch_channels();
}
char *n1_json_buffer(void) { return json; }
int n1_json_capacity(void) { return JSON_CAPACITY; }
int n1_receive_json(int size) {
  Channel parsed[3];
  int i;
  if (size <= 0 || size >= JSON_CAPACITY) { n1_channels_failed(); return 0; }
  length = size;
  cursor = 0;
  if (!parse_channels(parsed)) { n1_channels_failed(); return 0; }
  for (i = 0; i < 3; i++) {
    copy_string(channels[i].id, parsed[i].id, sizeof channels[i].id);
    copy_string(channels[i].short_name, parsed[i].short_name, sizeof channels[i].short_name);
    copy_string(channels[i].url, parsed[i].url, sizeof channels[i].url);
  }
  source_status = N1_SOURCE_READY;
  channel_focus = 0;
  render();
  return 1;
}
void n1_channels_failed(void) { source_status = N1_SOURCE_ERROR; render(); }
void n1_action(int action, int index) {
  if (action == N1_THEME) { if (view != N1_PLAYER) { toggle_theme(); } }
  else if (action == N1_WATCH) { show_channels(); }
  else if (action == N1_SELECT) { start_channel(index); }
  else if (action == N1_RETRY) { if (view == N1_PLAYER && video_status == N1_VIDEO_ERROR) { start_channel(current_index); } else if (source_status == N1_SOURCE_ERROR) { source_status = N1_SOURCE_LOADING; render(); host_fetch_channels(); } }
  else if (action == N1_PAUSE_CONTROL) { pause_video(0); }
}
void n1_key(int key, int repeat) {
  if (key == 10009 || key == 8 || key == 27) { back(); return; }
  if (key == 403) { show_channels(); return; }
  if (key >= 49 && key <= 51) { start_channel(key - 49); return; }
  if (view == N1_HOME) {
    if (key == 38) { theme_focus = 1; render(); }
    else if (key == 40) { theme_focus = 0; render(); }
    else if (key == 37 || key == 39) { theme_focus = 0; home_focus = key == 37 ? 0 : 1; render(); }
    else if (key == 13) { if (theme_focus) { toggle_theme(); } else if (home_focus == 0) { show_channels(); } }
  } else if (view == N1_CHANNELS) {
    if (key == 38 && (theme_focus || channel_focus == 0)) { theme_focus = 1; render(); }
    else if (key == 40 && theme_focus) { theme_focus = 0; channel_focus = 0; render(); }
    else if (source_status != N1_SOURCE_READY) { if (key == 13) { if (theme_focus) { toggle_theme(); } else if (source_status == N1_SOURCE_ERROR) { n1_action(N1_RETRY, 0); } } }
    else if (key == 37 || key == 38) { theme_focus = 0; channel_focus = (channel_focus + 2) % 3; render(); }
    else if (key == 39 || key == 40) { theme_focus = 0; channel_focus = (channel_focus + 1) % 3; render(); }
    else if (key == 13) { if (theme_focus) { toggle_theme(); } else { start_channel(channel_focus); } }
  } else if (view == N1_PLAYER) {
    if (repeat && (key == 37 || key == 38 || key == 39 || key == 40 || key == 427 || key == 428 || key == 10232 || key == 10233)) { return; }
    if (key == 37 || key == 40 || key == 428 || key == 10232) { start_channel((current_index + 2) % 3); }
    else if (key == 39 || key == 38 || key == 427 || key == 10233) { start_channel((current_index + 1) % 3); }
    else if (key == 13 || key == 32) { if (video_status == N1_VIDEO_ERROR) { start_channel(current_index); } else { pause_video(0); } }
    else if (key == 10252) { pause_video(0); }
    else if (key == 19) { pause_video(2); }
    else if (key == 415) { pause_video(1); }
  }
}
void n1_video_ready(int token) {
  if (token != generation || view != N1_PLAYER) { return; }
  if (!playback_ready) {
    playback_ready = 1;
    badge_visible = 1;
    host_schedule(N1_TIMER_BADGE, 3000, token);
  }
  video_status = N1_VIDEO_PLAYING;
  render();
}
void n1_video_buffering(int token) {
  if (token != generation || view != N1_PLAYER) { return; }
  video_status = N1_VIDEO_LOADING;
  badge_visible = control_visible = 0;
  render();
}
void n1_video_error(int token) {
  if (token != generation || view != N1_PLAYER) { return; }
  video_status = N1_VIDEO_ERROR;
  badge_visible = control_visible = 0;
  render();
}
void n1_timer(int kind, int token) {
  if (token != generation || view != N1_PLAYER) { return; }
  if (kind == N1_TIMER_BADGE) { badge_visible = 0; }
  else if (kind == N1_TIMER_CONTROL && video_status == N1_VIDEO_PLAYING) { control_visible = 0; }
  render();
}
void n1_background(void) { if (view == N1_PLAYER) { show_channels(); } }

int n1_screen(void) { return view; }
int n1_source_status(void) { return source_status; }
int n1_video_status(void) { return video_status; }
int n1_theme(void) { return dark_theme; }
int n1_theme_focus(void) { return theme_focus; }
int n1_home_focus(void) { return home_focus; }
int n1_channel_focus(void) { return channel_focus; }
int n1_current_index(void) { return current_index; }
int n1_generation(void) { return generation; }
int n1_badge_visible(void) { return badge_visible; }
int n1_control_visible(void) { return control_visible; }
const char *n1_string_short(int index) { return index >= 0 && index < 3 ? channels[index].short_name : 0; }
const char *n1_string_url(int index) { return index >= 0 && index < 3 ? channels[index].url : 0; }
