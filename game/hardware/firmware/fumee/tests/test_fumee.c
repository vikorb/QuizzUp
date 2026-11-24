/*
 * Déroule vecteurs.txt sur fumee_logic.c. Sécurité : fumée.
 * Usage : test_fumee [chemin de vecteurs.txt]   (défaut : vecteurs.txt, lancé depuis ce dossier)
 * Sort en 1 au premier écart, en nommant le scénario et la ligne du fichier.
 */
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../fumee_logic.h"

#define LINE_MAX_CHARS 512
/* 2^31 : un instant qui recule depuis une valeur au-dessus de ce seuil vers une valeur en dessous
 * est un débordement du compteur ; tout autre recul est une erreur du fichier. */
#define HALF_RANGE 2147483648ULL

static int fail(const char *scenario, int lineNo, const char *what) {
  fprintf(stderr, "ECART scenario \"%s\", ligne %d de vecteurs.txt : %s\n", scenario, lineNo, what);
  return 1;
}

/* Cas qu'un fichier texte ne sait pas écrire : ligne vide, octet NUL, retour chariot. */
static int check_raw_lines(void) {
  struct {
    const char *name;
    const char *line;
    size_t len;
  } cases[] = {
      {"ligne vide", "", 0},
      {"F suivi d'un octet NUL", "F\0x", 3},
      {"F suivi d'un retour chariot", "F\r", 2},
      {"F avec un espace", "F ", 2},
      {"ligne trop longue signalée par la carte", "?", 1},
  };
  size_t i;
  for (i = 0; i < sizeof cases / sizeof cases[0]; i++) {
    fumee_t f;
    fumee_init(&f, 0);
    /* Un jet commence à la fin de la pause de démarrage, puis la ligne illisible le coupe. */
    fumee_line(&f, FUMEE_COOL_MS, "F", 1);
    fumee_line(&f, FUMEE_COOL_MS + 100, cases[i].line, cases[i].len);
    if (f.out != 0 || f.state != FUMEE_ST_COOL || f.cause != FUMEE_CAUSE_BAD) {
      return fail(cases[i].name, 0, "doit couper le jet avec la cause BAD");
    }
  }
  return 0;
}

/* Lit les scénarios de fp ; l'appelant ferme le fichier, quelle que soit la sortie. */
static int run_vectors(FILE *fp) {
  char buf[LINE_MAX_CHARS];
  char scenario[LINE_MAX_CHARS] = "";
  int lineNo = 0;
  int scenarios = 0;
  int events = 0;
  unsigned long long prev = 0;
  fumee_t f;

  fumee_init(&f, 0);

  while (fgets(buf, sizeof buf, fp) != NULL) {
    unsigned long long t;
    char input[LINE_MAX_CHARS], state[16], cause[16];
    int out;
    int used = 0;
    const char *rest;
    char msg[160];
    size_t n = strlen(buf);

    lineNo++;
    if (n > 0 && buf[n - 1] != '\n' && !feof(fp)) {
      return fail(scenario, lineNo, "ligne trop longue");
    }
    if (buf[0] == '#' || buf[0] == '\n' || buf[0] == '\r' || buf[0] == '\0') {
      continue;
    }
    if (buf[0] == '=') {
      char *name = buf + 1;
      while (*name == ' ') {
        name++;
      }
      name[strcspn(name, "\r\n")] = '\0';
      strcpy(scenario, name);
      /* Chaque scénario repart d'une carte remise à zéro à t=0 : pause de 5 s. */
      fumee_init(&f, 0);
      prev = 0;
      scenarios++;
      continue;
    }
    if (scenarios == 0) {
      return fail("", lineNo, "événement avant le premier scénario");
    }
    if (sscanf(buf, "%llu %511s %d %15s %15s%n", &t, input, &out, state, cause, &used) != 5) {
      return fail(scenario, lineNo, "ligne mal formée");
    }
    for (rest = buf + used; *rest != '\0'; rest++) {
      if (!isspace((unsigned char)*rest)) {
        return fail(scenario, lineNo, "champ en trop sur la ligne");
      }
    }
    if (t > 4294967295ULL) {
      return fail(scenario, lineNo, "t_ms dépasse 4294967295");
    }
    /* Le temps ne recule jamais, sauf au débordement de 4294967295 vers 0. */
    if (t < prev && !(prev > HALF_RANGE && t < HALF_RANGE)) {
      return fail(scenario, lineNo, "t_ms recule sans débordement du compteur");
    }
    prev = t;

    if (strcmp(input, "-") == 0) {
      fumee_tick(&f, (uint32_t)t);
    } else {
      fumee_line(&f, (uint32_t)t, input, strlen(input));
    }
    events++;

    if (f.out != (f.state == FUMEE_ST_FIRE ? 1 : 0)) {
      return fail(scenario, lineNo, "la sortie et l'état se contredisent");
    }
    if (f.out != out || strcmp(fumee_state_name(f.state), state) != 0 ||
        strcmp(fumee_cause_name(f.cause), cause) != 0) {
      snprintf(msg, sizeof msg, "attendu %d %s %s, obtenu %d %s %s", out, state, cause, f.out,
               fumee_state_name(f.state), fumee_cause_name(f.cause));
      return fail(scenario, lineNo, msg);
    }
  }

  if (scenarios == 0 || events == 0) {
    return fail("", 0, "aucun scénario lu");
  }
  printf("OK : %d scenarios, %d evenements\n", scenarios, events);
  return 0;
}

int main(int argc, char **argv) {
  const char *path = argc > 1 ? argv[1] : "vecteurs.txt";
  FILE *fp;
  int rc;

  if (strcmp(FUMEE_BANNER, "QZF READY 1 1.0.0 10000 5000 500") != 0) {
    return fail("bannière", 0, "FUMEE_BANNER ne vaut pas QZF READY 1 1.0.0 10000 5000 500");
  }
  if (check_raw_lines() != 0) {
    return 1;
  }
  fp = fopen(path, "r");
  if (fp == NULL) {
    fprintf(stderr, "ECART : impossible d'ouvrir %s\n", path);
    return 1;
  }
  rc = run_vectors(fp);
  fclose(fp);
  return rc;
}
