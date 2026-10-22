#include "../src/core.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static int renders, fetches, plays, stops, pauses, saved_theme, scheduled;
static int last_index, last_generation, last_pause;

void host_render(void) { renders++; }
void host_fetch_channels(void) { fetches++; }
void host_play(int index, int generation) { plays++; last_index = index; last_generation = generation; }
void host_stop(void) { stops++; }
void host_pause(int play, int generation) { pauses++; last_pause = play; last_generation = generation; }
void host_save_theme(int dark) { saved_theme = dark; }
void host_exit(void) {}
void host_schedule(int kind, int milliseconds, int generation) { (void)kind; (void)milliseconds; (void)generation; scheduled++; }

int main(void) {
  FILE *file = fopen("channels.json", "rb");
  long size;
  assert(file);
  assert(fseek(file, 0, SEEK_END) == 0);
  size = ftell(file);
  assert(size > 0 && size < n1_json_capacity());
  rewind(file);

  n1_init(0);
  assert(n1_screen() == N1_HOME && n1_source_status() == N1_SOURCE_LOADING);
  assert(fetches == 1);
  assert(fread(n1_json_buffer(), 1, (size_t)size, file) == (size_t)size);
  fclose(file);
  assert(n1_receive_json((int)size));
  assert(n1_source_status() == N1_SOURCE_READY);
  assert(strcmp(n1_string_short(0), "Bosna i Hercegovina") == 0);
  assert(strstr(n1_string_url(2), "n1srp"));
  assert(fetches == 1);

  n1_action(N1_WATCH, 0);
  assert(n1_screen() == N1_CHANNELS && n1_channel_focus() == 0);
  n1_key(39, 0);
  assert(n1_channel_focus() == 1);
  n1_key(13, 0);
  assert(n1_screen() == N1_PLAYER && last_index == 1 && plays == 1);
  assert(n1_video_status() == N1_VIDEO_LOADING);
  n1_video_ready(last_generation);
  assert(n1_video_status() == N1_VIDEO_PLAYING && n1_badge_visible());
  n1_timer(N1_TIMER_BADGE, last_generation);
  assert(!n1_badge_visible());

  n1_key(13, 0);
  assert(n1_video_status() == N1_VIDEO_PAUSED && last_pause == 0 && pauses == 1);
  n1_key(10252, 0);
  assert(n1_video_status() == N1_VIDEO_PLAYING && last_pause == 1 && pauses == 2);
  n1_key(427, 0);
  assert(last_index == 2 && plays == 2 && stops == 1);
  n1_video_ready(last_generation - 1);
  assert(n1_video_status() == N1_VIDEO_LOADING);
  n1_video_ready(last_generation);
  n1_key(428, 0);
  assert(last_index == 1 && plays == 3);
  n1_key(49, 0);
  assert(last_index == 0 && plays == 4);
  n1_key(10009, 0);
  assert(n1_screen() == N1_CHANNELS && stops == 4);
  assert(fetches == 1);

  n1_key(38, 0);
  assert(n1_theme_focus());
  n1_key(13, 0);
  assert(n1_theme() && saved_theme == 1);
  n1_action(N1_WATCH, 0);
  assert(fetches == 1);

  n1_init(0);
  memcpy(n1_json_buffer(), "{}", 2);
  assert(!n1_receive_json(2));
  assert(n1_source_status() == N1_SOURCE_ERROR);
  assert(renders > 0 && scheduled > 0);
  puts("PASS C core: GitHub JSON, focus, channel switching, pause, badge, theme, stale callbacks");
  return 0;
}
