#ifndef N1_CORE_H
#define N1_CORE_H

/* Platform functions. Every TV port implements this small boundary. */
void host_render(void);
void host_fetch_channels(void);
void host_play(int index, int generation);
void host_stop(void);
void host_pause(int play, int generation);
void host_save_theme(int dark);
void host_exit(void);
void host_schedule(int kind, int milliseconds, int generation);

enum { N1_HOME, N1_CHANNELS, N1_PLAYER };
enum { N1_SOURCE_LOADING, N1_SOURCE_READY, N1_SOURCE_ERROR };
enum { N1_VIDEO_LOADING, N1_VIDEO_PLAYING, N1_VIDEO_PAUSED, N1_VIDEO_ERROR };
enum { N1_WATCH = 1, N1_THEME, N1_SELECT, N1_RETRY, N1_PAUSE_CONTROL };
enum { N1_TIMER_BADGE = 1, N1_TIMER_CONTROL };

void n1_init(int dark);
char *n1_json_buffer(void);
int n1_json_capacity(void);
int n1_receive_json(int size);
void n1_channels_failed(void);
void n1_action(int action, int index);
void n1_key(int key, int repeat);
void n1_video_ready(int generation);
void n1_video_buffering(int generation);
void n1_video_error(int generation);
void n1_timer(int kind, int generation);
void n1_background(void);

int n1_screen(void);
int n1_source_status(void);
int n1_video_status(void);
int n1_theme(void);
int n1_theme_focus(void);
int n1_home_focus(void);
int n1_channel_focus(void);
int n1_current_index(void);
int n1_generation(void);
int n1_badge_visible(void);
int n1_control_visible(void);
const char *n1_string_short(int index);
const char *n1_string_url(int index);

#endif
