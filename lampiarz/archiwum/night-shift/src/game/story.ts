// All narrative text: documents, transmissions, missions and endings.

export interface Doc {
  id: string;
  title: string;
  kind: string;
  text: string;
}

export const DOCS: Doc[] = [
  {
    id: 'd01',
    title: 'Instrukcja nocnej zmiany',
    kind: 'Procedura',
    text: '1. Zmiana trwa od 23:00 do 06:00. Drzwi zewnętrzne otwierają się automatycznie o 06:00.\n2. Co godzinę sprawdź wszystkie kamery.\n3. Awarie zasilania zgłaszaj NADZORCY i usuwaj w pomieszczeniu technicznym.\n4. Do Sektora C wchodzisz wyłącznie na polecenie NADZORCY.\n5. Jeśli o 03:17 usłyszysz z radia własny głos — nie odpowiadaj.',
  },
  {
    id: 'd02',
    title: 'Kartka przyklejona do monitora',
    kind: 'Notatka zmiany dziennej',
    text: 'Kamera 6 znów się włączyła sama. Technicy twierdzą, że takiej kamery nie ma w instalacji. Ja tam widziałem biurko i lampkę. Kto zostawia zapaloną lampkę w pokoju, którego nie ma? — P.',
  },
  {
    id: 'd03',
    title: 'Raport z uruchomienia Komory K-1',
    kind: 'Raport techniczny',
    text: 'Data pierwszego pełnego uruchomienia: 14.11.1997, godz. 03:17. Tło akustyczne komory: −9 dB. Zarejestrowano sygnał o strukturze zbliżonej do pracy wentylacji ośrodka. Sygnał wyprzedzał rzeczywistość o ok. 24 godziny. Zalecenie: kontynuować.',
  },
  {
    id: 'd04',
    title: 'Notatka laboranta',
    kind: 'Karteczka',
    text: 'Kod do archiwum zmieniony. Kierownik uznał, że będzie zabawnie: to dzień i miesiąc pierwszego uruchomienia Komory. Cztery cyfry. Mam nadzieję, że nikt z nas nie zapomni tej daty. Chociaż to akurat niemożliwe.',
  },
  {
    id: 'd05',
    title: 'Protokół awarii nr 41',
    kind: 'Protokół',
    text: 'Zanik zasilania głównego, godz. 00:58. Przepalone dwa bezpieczniki 63 A. Uwaga: to ta sama awaria, z tą samą godziną, co w protokołach 1–40. Te same bezpieczniki. Te same moje odciski palców na pokrywie panelu, zanim jej dotknąłem.',
  },
  {
    id: 'd06',
    title: 'Dziennik E. Sowińskiej, s. 14',
    kind: 'Dziennik prywatny',
    text: 'Piszę na dłoni godzinę, o której zaczynam. Kiedy wracam do recepcji, napis jest, ale zegar znów pokazuje 23:00. Kamera 4 pokazuje kogoś w korytarzu. Ma moją kurtkę. Jutro, czy raczej dzisiaj, nie pójdę go sprawdzić.',
  },
  {
    id: 'd07',
    title: 'Komunikat BHP nr 7',
    kind: 'Tablica ogłoszeń',
    text: 'Postać widoczna na monitoringu, której nie ma w korytarzu, jest artefaktem kompresji obrazu. Nie należy jej sprawdzać osobiście. Nie należy zostawać z nią w ciemności. W razie wątpliwości: zapal światło i zachowaj ciszę. Ono nie lubi, gdy się na nie świeci.',
  },
  {
    id: 'd08',
    title: 'Zapis z eksperymentu K-1/7',
    kind: 'Protokół badawczy',
    text: 'Ochotnik nr 7 w komorze od 02:50. O 03:17 rejestrator zapisał jego kroki w korytarzu wschodnim, choć nie opuścił komory. Drzwi komory były otwarte przez cały czas. Ochotnik nie wyszedł. Zalecenie NADZORCY: utrzymać ciągłość zmiany.',
  },
  {
    id: 'd09',
    title: 'Transkrypcja z rejestratora radiowego',
    kind: 'Zapis radiowy',
    text: '[02:44] Głos kobiecy: „Kto odbiera? Tu technik sześć. Jeśli słyszysz mnie drugi raz, to znaczy, że też tu utknąłeś. Nie ufaj poleceniom o teście. Zapisz to sobie na ręce.” [szum] [03:17] Głos męski, identyczny z głosem odbiorcy: „Słyszę cię.”',
  },
  {
    id: 'd10',
    title: 'Dziennik E. Sowińskiej, s. 31',
    kind: 'Dziennik prywatny',
    text: 'NADZORCA nie pilnuje nas. Pilnuje ciągłości. Każda noc musi mieć technika, inaczej pętla się rozsypie. Ci, którzy zostają w niej zbyt długo, przestają być ludźmi. Nazywamy to Przestojem. Chodzi tymi samymi korytarzami. Nosi nasze kurtki.',
  },
  {
    id: 'd11',
    title: 'Notatka służbowa dyr. L. Grabarza',
    kind: 'Poufne',
    text: 'Pętla stabilna od 9 lat. Komora daje nam jutro z wyprzedzeniem jednej doby — wynik bezcenny. Koszt: jeden technik na noc, którego nikt nie pamięta. Klucz ciągłości trzymam w Pokoju 0. Kod: godzina uruchomienia. Gdyby ktoś chciał wszystko zatrzymać, wystarczy go przekręcić w terminalu komory. Nikt nie będzie chciał.',
  },
  {
    id: 'd12',
    title: 'Ostatnia strona',
    kind: 'Kartka wyrwana z dziennika',
    text: 'Jeśli to czytasz, jesteś siódmy. Masz trzy drogi. Winda: wyjdziesz, a pętla weźmie kogoś innego. Nadajnik: świat się dowie, ale ono przyjdzie po ciebie, zanim skończysz. Klucz: zatrzymasz ciągłość, ale ktoś musi zostać w komorze o 03:17. Ja nie zdążyłam wybrać. — Ewa',
  },
];

export const DOC_BY_ID = Object.fromEntries(DOCS.map((d) => [d.id, d]));

export type Speaker = 'NADZORCA' | 'RADIO' | 'INTERKOM' | 'TY';

export interface Line {
  who: Speaker;
  text: string;
  /** seconds on screen */
  t?: number;
}

/** Scripted transmissions; triggered once by the event system. */
export const LINES: Record<string, Line[]> = {
  welcome: [
    { who: 'NADZORCA', text: 'Dobry wieczór, techniku siedem. Rozpoczynasz nocną zmianę w ośrodku H-27.' },
    { who: 'NADZORCA', text: 'Zaloguj się w terminalu recepcji. Procedura jest krótka.' },
  ],
  loggedIn: [
    { who: 'NADZORCA', text: 'Zalogowano. Pokój monitoringu jest otwarty. Sprawdź wszystkie kamery.' },
  ],
  cam4: [{ who: 'NADZORCA', text: 'Kamera 4: brak ruchu w korytarzu wschodnim. Obraz jest prawidłowy.' }],
  cam6: [
    { who: 'NADZORCA', text: 'Kamera 6 nie istnieje w rejestrze. Przełącz na kolejną kamerę.' },
    { who: 'TY', text: 'Lampka. Ktoś tam jest… albo był.' },
  ],
  outage: [
    { who: 'NADZORCA', text: 'Zanik zasilania głównego. Przechodzę na rezerwę.' },
    { who: 'NADZORCA', text: 'Udaj się do pomieszczenia technicznego. Korytarz główny, drzwi po południowej stronie.' },
  ],
  panel: [
    { who: 'NADZORCA', text: 'Brakuje dwóch bezpieczników 63 A. Zapasowe znajdziesz w laboratorium i w archiwum.' },
    { who: 'RADIO', text: '…technik siedem? Słyszysz? Za chwilę otworzysz szafkę w laboratorium. Nie zostawaj tam po ciemku…' },
  ],
  firstFuse: [
    { who: 'RADIO', text: 'Kod do archiwum to data. Zawsze ta sama data. Ono już cię słyszy — chodź po jasnym.' },
  ],
  powerOn: [
    { who: 'NADZORCA', text: 'Zasilanie główne przywrócone. Moc: 7 jednostek. Rozdziel ją rozsądnie.' },
    { who: 'NADZORCA', text: 'Nowe polecenie: udaj się do Sektora C i przygotuj Komorę K-1 do testu. Karta poziomu 3 leży w archiwum.' },
  ],
  sectorC: [
    { who: 'NADZORCA', text: 'Jesteś w Sektorze C. Terminal testowy znajduje się w komorze.' },
    { who: 'RADIO', text: 'Nie uruchamiaj testu. Proszę. Ja go uruchomiłam.' },
  ],
  truth: [
    { who: 'NADZORCA', text: 'Wykryto nieautoryzowany odczyt archiwum. Ogłaszam blokadę ciągłości.' },
    { who: 'RADIO', text: 'Teraz on wie, że ty wiesz. Przełącznik awaryjny w technice zwolni strefę ewakuacyjną. Pokój 0 — kod to godzina.' },
    { who: 'NADZORCA', text: 'Techniku siedem: uruchom test w Komorze K-1. To jedyna procedura bezpieczna.' },
  ],
  liftCalled: [{ who: 'NADZORCA', text: 'Winda w drodze. Czas przyjazdu: czterdzieści sekund. Nie opuszczaj strefy.' }],
  transmit: [{ who: 'RADIO', text: 'Nadaje! Wytrzymaj, aż pasek dojdzie do końca. Ono to słyszy tak samo jak my.' }],
  stopLoop: [{ who: 'NADZORCA', text: 'Wycofanie klucza ciągłości. Procedura niedozwolona. Procedura… niedozwolona…' }],
  ewaLate: [{ who: 'RADIO', text: 'Kiedy zgasną korytarze, idź od lampy do lampy. Szafki go nie powstrzymają, ale go zmylą.' }],
  przestoj: [{ who: 'RADIO', text: 'Słyszysz te kroki? Nie odwracaj się do nich plecami w ciemności.' }],
  roomSeen: [{ who: 'TY', text: 'To ten pokój z kamery szóstej. Lampka nadal się świeci.' }],
};

export interface MissionDef {
  id: string;
  title: string;
  clock: number; // in-game minutes after 23:00 when the mission begins
  objective: string;
  hint?: string;
}

export const MISSIONS: MissionDef[] = [
  { id: 'zmiana', title: 'Początek zmiany', clock: 0, objective: 'Zaloguj się w terminalu recepcji.' },
  { id: 'kamery', title: 'Obchód kamer', clock: 14, objective: 'Sprawdź wszystkie kamery w pokoju monitoringu ({n}/6).', hint: 'Konsola przy ścianie monitorów. Przełączaj kamery A/D.' },
  { id: 'awaria', title: 'Awaria', clock: 118, objective: 'Dotrzyj do pomieszczenia technicznego.', hint: 'Korytarz główny, drzwi po południowej stronie. Latarka: F.' },
  { id: 'bezpieczniki', title: 'Bezpieczniki', clock: 132, objective: 'Znajdź bezpieczniki 63 A ({n}/2) i włóż je do panelu.', hint: 'Szafka w laboratorium. Archiwum zamyka kod — szukaj daty w dokumentach.' },
  { id: 'zasilanie', title: 'Rozdział mocy', clock: 160, objective: 'Uruchom zasilanie główne w panelu zasilania.' },
  { id: 'sektor', title: 'Sektor C', clock: 190, objective: 'Wejdź do Sektora C.', hint: 'Karta poziomu 3 jest w archiwum. Drzwi wymagają zasilania: Sektor C i zamki elektryczne.' },
  { id: 'komora', title: 'Komora K-1', clock: 214, objective: 'Zbadaj Komorę K-1 i terminal testowy.' },
  { id: 'decyzja', title: '03:17', clock: 236, objective: 'Zdecyduj, jak skończy się ta zmiana.' },
];

export type EndingId = 'ewakuacja' | 'sygnal' | 'cisza' | 'test';

export const ENDINGS: Record<EndingId, { title: string; paragraphs: string[]; tone: 'escape' | 'truth' | 'silence' | 'loop' }> = {
  ewakuacja: {
    title: 'Koniec zmiany',
    tone: 'escape',
    paragraphs: [
      'Winda rusza z szarpnięciem. Przez kratę widzisz, jak światła kolejnych pięter gasną jedno po drugim.',
      'Na powierzchni jest szaro i zimno. Prawdziwy świt. Zegarek pokazuje 03:18 — i nic się nie dzieje.',
      'W kieszeni kurtki trzeszczy radio. „Do zobaczenia jutro, techniku osiem” — mówi twój własny głos.',
    ],
  },
  sygnal: {
    title: 'Sygnał',
    tone: 'truth',
    paragraphs: [
      'Pasek transmisji dochodzi do końca w chwili, gdy za twoimi plecami cichnie wentylacja.',
      'Nie odwracasz się. Taśma, dzienniki, nagrania z kamer — wszystko jest już poza ośrodkiem.',
      'Trzy dni później H-27 zostaje zamknięty. W raporcie komisji jest jedno zdanie, którego nikt nie umie wyjaśnić: „Na ostatniej taśmie technik siedem wciąż mówi.”',
    ],
  },
  cisza: {
    title: 'Cisza',
    tone: 'silence',
    paragraphs: [
      'Klucz obraca się z oporem, jakby ktoś po drugiej stronie trzymał go od dziewięciu lat.',
      'O 03:17 w komorze nie dzieje się nic. Po raz pierwszy słyszysz absolutną ciszę — i własny oddech, który do niej nie pasuje.',
      'Zmiana dzienna znajduje otwartą komorę i kurtkę z identyfikatorem nr 7. Zegary w H-27 pokazują 06:00. Pierwszy raz od dziewięciu lat.',
    ],
  },
  test: {
    title: 'Następna zmiana',
    tone: 'loop',
    paragraphs: [
      'Test rozpoczęty. NADZORCA dziękuje ci spokojnym, wyuczonym głosem.',
      'O 03:17 komora rejestruje kroki w korytarzu wschodnim. Twoje kroki. Nie opuściłeś komory.',
      'Następnej nocy nowy technik loguje się w recepcji. Na kamerze 4 widzi postać w znajomej kurtce. Nie idzie jej sprawdzić.',
    ],
  },
};

export const ENDING_ORDER: EndingId[] = ['ewakuacja', 'sygnal', 'cisza', 'test'];

/** Format minutes after 23:00 as a wall clock. */
export function clockText(min: number) {
  const total = (23 * 60 + Math.floor(min)) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export const CLOCK_0317 = 4 * 60 + 17;
