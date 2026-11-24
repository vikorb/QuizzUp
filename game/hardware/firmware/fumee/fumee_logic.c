/* Sécurité : fumée. Voir fumee_logic.h et README.md. */
#include "fumee_logic.h"

/*
 * Tous les écarts de temps sont des soustractions non signées : elles restent justes quand
 * millis() déborde (49 jours). Ne jamais comparer deux instants entre eux.
 */

void fumee_init(fumee_t *f) {
  f->out = 0;
  f->state = FUMEE_ST_READY;
  f->cause = FUMEE_CAUSE_CMD;
  f->held = 0;
  f->lease_at = 0;
  f->fire_start = 0;
  f->cool_start = 0;
}

/* Coupe la sortie. Un jet en cours déclenche la pause ; une pause déjà commencée n'est pas relancée. */
static void cut(fumee_t *f, uint32_t now, fumee_cause cause) {
  if (f->state == FUMEE_ST_FIRE) {
    f->state = FUMEE_ST_COOL;
    f->cool_start = now;
  }
  f->out = 0;
  f->cause = cause;
}

void fumee_tick(fumee_t *f, uint32_t now) {
  if (f->state == FUMEE_ST_FIRE) {
    if ((uint32_t)(now - f->fire_start) >= (uint32_t)FUMEE_MAX_MS) {
      cut(f, now, FUMEE_CAUSE_MAX);
    } else if ((uint32_t)(now - f->lease_at) >= (uint32_t)FUMEE_LEASE_MS) {
      cut(f, now, FUMEE_CAUSE_LEASE);
    }
  } else if (f->state == FUMEE_ST_COOL &&
             (uint32_t)(now - f->cool_start) >= (uint32_t)FUMEE_COOL_MS) {
    f->state = FUMEE_ST_READY;
  }
  /* Le flot de F refusés s'est tu assez longtemps : un nouveau F est de nouveau une demande. */
  if (f->held && (uint32_t)(now - f->lease_at) >= (uint32_t)FUMEE_LEASE_MS) {
    f->held = 0;
  }
}

void fumee_line(fumee_t *f, uint32_t now, const char *line, size_t len) {
  /* D'abord le temps : un bail ou un plafond échu coupe avant que la ligne soit lue. */
  fumee_tick(f, now);

  if (len == 1 && line[0] == 'F') {
    if (f->state == FUMEE_ST_FIRE) {
      f->lease_at = now;
    } else if (f->state == FUMEE_ST_READY && !f->held) {
      f->state = FUMEE_ST_FIRE;
      f->out = 1;
      f->fire_start = now;
      f->lease_at = now;
    } else {
      /* Refusé (pause, ou flot déjà refusé). Il ne se transforme jamais en jet plus tard. */
      f->held = 1;
      f->lease_at = now;
    }
  } else if (len == 1 && line[0] == 'H') {
    /* Présence : rien à faire, surtout pas toucher au bail. */
  } else if (len == 1 && line[0] == '0') {
    cut(f, now, FUMEE_CAUSE_CMD);
    f->held = 0;
  } else {
    cut(f, now, FUMEE_CAUSE_BAD);
  }
}

const char *fumee_state_name(fumee_state s) {
  switch (s) {
    case FUMEE_ST_FIRE:
      return "FIRE";
    case FUMEE_ST_COOL:
      return "COOL";
    default:
      return "READY";
  }
}

const char *fumee_cause_name(fumee_cause c) {
  switch (c) {
    case FUMEE_CAUSE_LEASE:
      return "LEASE";
    case FUMEE_CAUSE_MAX:
      return "MAX";
    case FUMEE_CAUSE_BAD:
      return "BAD";
    default:
      return "CMD";
  }
}
