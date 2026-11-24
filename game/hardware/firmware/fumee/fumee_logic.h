/*
 * Logique de la fumée : C99 pur, sans Arduino, sans allocation.
 * Elle décide seule si la sortie de la carte (broche A0) est au niveau haut.
 * Sécurité : fumée. Les durées sont égales à SMOKE_HARD_LIMITS et WATCHDOG_STALL_MS de
 * game/hardware (plafond 10 s, pause 5 s, bail 500 ms) ; le test C et le test TypeScript
 * partagent vecteurs.txt.
 */
#ifndef FUMEE_LOGIC_H
#define FUMEE_LOGIC_H

#include <stddef.h>
#include <stdint.h>

#define FUMEE_PROTOCOL 1
#define FUMEE_VERSION "1.0.0"
/* Nombres nus : ils sont aussi mis en texte dans la bannière. */
#define FUMEE_MAX_MS 10000
#define FUMEE_COOL_MS 5000
#define FUMEE_LEASE_MS 500

#define FUMEE_STR_(x) #x
#define FUMEE_STR(x) FUMEE_STR_(x)
#define FUMEE_BANNER                                                                          \
  "QZF READY " FUMEE_STR(FUMEE_PROTOCOL) " " FUMEE_VERSION " " FUMEE_STR(FUMEE_MAX_MS) " " \
  FUMEE_STR(FUMEE_COOL_MS) " " FUMEE_STR(FUMEE_LEASE_MS)

#ifdef __cplusplus
extern "C" {
#endif

typedef enum { FUMEE_ST_READY = 0, FUMEE_ST_FIRE = 1, FUMEE_ST_COOL = 2 } fumee_state;

typedef enum {
  FUMEE_CAUSE_LEASE = 0,
  FUMEE_CAUSE_MAX = 1,
  FUMEE_CAUSE_CMD = 2,
  FUMEE_CAUSE_BAD = 3
} fumee_cause;

typedef struct {
  uint8_t out;        /* 1 = A0 au niveau haut. Toujours égal à (state == FUMEE_ST_FIRE). */
  fumee_state state;  /* READY : prête. FIRE : jet en cours. COOL : pause (après un jet, au démarrage). */
  fumee_cause cause;  /* Raison de la dernière coupure réelle d'un jet ; CMD au démarrage. Un 0 ou une
                         ligne illisible hors jet ne la change pas. */
  uint8_t held;       /* Un F a été refusé et le flot continue : il ne lancera jamais un jet. */
  uint32_t lease_at;  /* Instant du dernier F reçu (accepté ou refusé). */
  uint32_t fire_start;
  uint32_t cool_start; /* Instant où la pause a commencé : arrêt du dernier jet, ou démarrage. */
} fumee_t;

/* Carte remise à zéro à l'instant now : sortie coupée, en pause pour 5 s (état COOL). */
void fumee_init(fumee_t *f, uint32_t now);

/* Une ligne reçue (sans le '\n'), à l'instant now (ms, entier non signé 32 bits qui déborde). */
void fumee_line(fumee_t *f, uint32_t now, const char *line, size_t len);

/* Le temps passe : à appeler à chaque tour de boucle. */
void fumee_tick(fumee_t *f, uint32_t now);

const char *fumee_state_name(fumee_state s);
const char *fumee_cause_name(fumee_cause c);

#ifdef __cplusplus
}
#endif

#endif
