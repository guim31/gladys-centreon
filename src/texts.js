// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// messages. Four languages, the four of the Gladys interface; German says
// "du", Spanish "usted". test/i18n.test.js checks every table.
//
// The states (UP, DOWN, UNREACHABLE, OK, WARNING, CRITICAL, UNKNOWN) stay
// the words of Centreon: its interface does not translate them either.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './centreon/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Centreon and a user in the configuration.',
    fr: "Saisissez l'adresse de votre Centreon et un utilisateur dans la configuration.",
    de: 'Gib die Adresse deines Centreon und einen Benutzer in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Centreon y un usuario en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. 192.168.1.2 or http://centreon.lan/centreon',
    fr: 'Adresse incomprise, ex. 192.168.1.2 ou http://centreon.lan/centreon',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.2 oder http://centreon.lan/centreon',
    es: 'Dirección no válida, p. ej. 192.168.1.2 o http://centreon.lan/centreon',
  },
};

// One short explanation per error kind (src/centreon/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Centreon does not answer',
    fr: 'Centreon ne répond pas',
    de: 'Centreon antwortet nicht',
    es: 'Centreon no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'login or password refused by Centreon',
    fr: 'identifiant ou mot de passe refusé par Centreon',
    de: 'Benutzername oder Passwort von Centreon abgelehnt',
    es: 'usuario o contraseña rechazados por Centreon',
  },
  [ERROR_KINDS.CREDENTIALS_MISSING]: {
    en: 'a Centreon login and its password are needed',
    fr: 'un identifiant Centreon et son mot de passe sont nécessaires',
    de: 'ein Centreon-Benutzername und sein Passwort sind nötig',
    es: 'se necesitan un usuario de Centreon y su contraseña',
  },
  [ERROR_KINDS.NOT_CENTREON]: {
    en: 'no Centreon API at this address: check it (e.g. http://192.168.1.2/centreon)',
    fr: "pas d'API Centreon à cette adresse : vérifiez-la (ex. http://192.168.1.2/centreon)",
    de: 'keine Centreon-API unter dieser Adresse: Prüfe sie (z. B. http://192.168.1.2/centreon)',
    es: 'no hay ninguna API de Centreon en esta dirección: compruébela (p. ej. http://192.168.1.2/centreon)',
  },
  [ERROR_KINDS.HTTPS_REQUIRED]: {
    en: 'this Centreon redirects to HTTPS: enter https://',
    fr: 'ce Centreon redirige vers HTTPS : saisissez https://',
    de: 'dieses Centreon leitet auf HTTPS um: Gib https:// ein',
    es: 'este Centreon redirige a HTTPS: introduzca https://',
  },
  [ERROR_KINDS.NO_HOSTS]: {
    en: 'no host visible: give the user an ACL resource with hosts',
    fr: "aucun hôte visible : donnez à l'utilisateur une ressource ACL avec des hôtes",
    de: 'kein Host sichtbar: Gib dem Benutzer eine ACL-Ressource mit Hosts',
    es: 'ningún host visible: asigne al usuario un recurso ACL con hosts',
  },
  [ERROR_KINDS.NO_GROUPS]: {
    en: 'host groups not found: check the names, and the host groups of the ACL resource',
    fr: "groupes d'hôtes introuvables : vérifiez les noms et les groupes d'hôtes de la ressource ACL",
    de: 'Hostgruppen nicht gefunden: Prüfe die Namen und die Hostgruppen der ACL-Ressource',
    es: 'grupos de hosts no encontrados: compruebe los nombres y los grupos de hosts del recurso ACL',
  },
  [ERROR_KINDS.PERMISSION]: {
    en: 'access refused: allow the user to "Reach API Realtime", see the documentation',
    fr: "accès refusé : autorisez l'utilisateur à « Reach API Realtime », voir la documentation",
    de: 'Zugriff verweigert: Erlaube dem Benutzer „Reach API Realtime“, sieh in der Dokumentation nach',
    es: 'acceso denegado: permita al usuario «Reach API Realtime», consulte la documentación',
  },
  [ERROR_KINDS.API]: {
    en: 'request refused by Centreon, see the logs',
    fr: 'requête refusée par Centreon, voir les logs',
    de: 'Anfrage von Centreon abgelehnt, sieh in den Protokollen nach',
    es: 'petición rechazada por Centreon, consulte los registros',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

export const HOST_STATE_NAMES = ['UP', 'DOWN', 'UNREACHABLE'];
export const SERVICE_STATE_NAMES = ['OK', 'WARNING', 'CRITICAL', 'UNKNOWN'];

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} host(s)` : `${count}/${total} host(s)`),
    problems: (down, services) => `${down} host(s) down, ${services} service problem(s)`,
  },
  fr: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} hôte(s)` : `${count}/${total} hôte(s)`),
    problems: (down, services) => `${down} hôte(s) DOWN, ${services} service(s) en problème`,
  },
  de: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} Host(s)` : `${count}/${total} Host(s)`),
    problems: (down, services) => `${down} Host(s) DOWN, ${services} Service-Problem(e)`,
  },
  es: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} host(s)` : `${count}/${total} host(s)`),
    problems: (down, services) => `${down} host(s) DOWN, ${services} servicio(s) con problemas`,
  },
};

// Scene action messages (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Centreon is configured.',
    fr: "Aucun Centreon n'est configuré.",
    de: 'Kein Centreon ist konfiguriert.',
    es: 'No hay ningún Centreon configurado.',
  },
  unknownHost: {
    en: 'This device is not a Centreon host.',
    fr: "Cet appareil n'est pas un hôte Centreon.",
    de: 'Dieses Gerät ist kein Centreon-Host.',
    es: 'Este dispositivo no es un host de Centreon.',
  },
  acknowledgeDisabled: {
    en: 'Acknowledging is turned off in the configuration of the integration.',
    fr: "L'acquittement est désactivé dans la configuration de l'intégration.",
    de: 'Das Quittieren ist in der Konfiguration der Integration ausgeschaltet.',
    es: 'El reconocimiento está desactivado en la configuración de la integración.',
  },
  acknowledgeRefused: {
    en: 'Centreon refused to acknowledge: give the user the ACL actions to acknowledge hosts and services.',
    fr: "Centreon a refusé l'acquittement : donnez à l'utilisateur les actions ACL d'acquittement des hôtes et des services.",
    de: 'Centreon hat das Quittieren abgelehnt: Gib dem Benutzer die ACL-Aktionen zum Quittieren von Hosts und Services.',
    es: 'Centreon rechazó el reconocimiento: conceda al usuario las acciones ACL de reconocimiento de hosts y servicios.',
  },
  defaultComment: {
    en: 'Acknowledged from Gladys',
    fr: 'Acquitté depuis Gladys',
    de: 'In Gladys quittiert',
    es: 'Reconocido desde Gladys',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
