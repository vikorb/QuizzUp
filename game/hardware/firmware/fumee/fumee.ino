// Sécurité : fumée. Programme de la carte (Uno R3) qui commande le relais de la machine à fumée.
// Toute la décision est dans fumee_logic.c ; ici, seulement la broche, le port série et le chien
// de garde. Voir README.md.
#include <avr/wdt.h>

#include "fumee_logic.h"

static const uint8_t PIN_FUMEE = A0;  // entrée du module relais : haut = fumée
static const uint8_t LINE_BUF_SIZE = 8;    // une ligne valide en fait 1 ; plus long = illisible

static fumee_t fumee;
static char lineBuf[LINE_BUF_SIZE];
static uint8_t lineLen = 0;
static bool lineTooLong = false;

static void applyOutput() {
  digitalWrite(PIN_FUMEE, fumee.out ? HIGH : LOW);
}

void setup() {
  // Première instruction de setup() : le relais est coupé avant toute autre chose.
  digitalWrite(PIN_FUMEE, LOW);
  pinMode(PIN_FUMEE, OUTPUT);

  // Un chargeur qui n'éteint pas le chien de garde après sa remise à zéro nous ferait boucler.
  MCUSR = 0;
  wdt_disable();

  // La carte démarre en pause de 5 s : une remise à zéro n'efface pas la pause.
  fumee_init(&fumee, millis());
  Serial.begin(9600);
  Serial.print(F(FUMEE_BANNER "\n"));

  // Le chien de garde n'est relancé que dans loop() : si loop() se fige, la carte redémarre,
  // A0 repasse en entrée (relais retombé).
  wdt_enable(WDTO_250MS);
}

static void answer() {
  Serial.print('S');
  Serial.print(' ');
  Serial.print(fumee.out ? '1' : '0');
  Serial.print(' ');
  Serial.print(fumee_state_name(fumee.state));
  Serial.print(' ');
  Serial.print(fumee_cause_name(fumee.cause));
  Serial.print('\n');
}

void loop() {
  wdt_reset();
  uint32_t now = millis();

  // Au plus une ligne par tour : un envoi bloqué par le débit ne doit jamais retarder le temps.
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c != '\n') {
      if (lineLen < LINE_BUF_SIZE) {
        lineBuf[lineLen++] = c;
      } else {
        lineTooLong = true;
      }
      continue;
    }
    if (lineTooLong) {
      fumee_line(&fumee, now, "?", 1);
    } else {
      fumee_line(&fumee, now, lineBuf, lineLen);
    }
    lineLen = 0;
    lineTooLong = false;
    applyOutput();
    answer();
    break;
  }

  fumee_tick(&fumee, now);
  applyOutput();
}
