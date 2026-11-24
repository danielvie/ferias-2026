import { mapDestination } from './selection';

const illustrations = new Map([
  ['Bruges',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M13 72H147V89H13Z" fill="#a8c7be" stroke="none" />
      <path d="M20 72V34H27V28H33V22H39V16H45V22H51V28H57V34H64V72Z" fill="#cc8668" />
      <path d="M64 72V42L83 27L102 42V72Z" fill="#e9c786" />
      <path d="M102 72V30H108V23H114V16H120V9H126V16H132V23H138V30H144V72Z" fill="#d6dcc5" />
      <path d="M32 44h5v8h-5z M47 44h5v8h-5z M32 58h5v8h-5z M47 58h5v8h-5z M80 43h6v8h-6z M75 57h5v8h-5z M88 57h5v8h-5z M113 39h5v9h-5z M128 39h5v9h-5z M113 56h5v10h-5z M128 56h5v10h-5z" fill="#395346" stroke="none" />
      <path d="M13 72H147M24 79H47M58 83H70M115 79H137" fill="none" />
      <path d="M75 77H107L100 84H82Z" fill="#cc8668" />
    </g>,
  ],
  ['Gante',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M19 81H142L134 89H29Z" fill="#a8c7be" stroke="none" />
      <path d="M50 75V25H58V31H65V25H73V31H81V25H89V31H97V25H106V75Z" fill="#d6dcc5" />
      <path d="M33 81V55H42V60H51V55H60V60H69V55H78V60H87V55H96V60H105V55H114V60H123V55H132V81Z" fill="#bb9679" />
      <path d="M22 81V44H28V38H34V44H40V38H46V44H51V81Z" fill="#e9c786" />
      <path d="M109 81V44H115V38H121V44H127V38H133V44H139V81Z" fill="#e9c786" />
      <path d="M72 81V72A8 8 0 0 1 88 72V81Z" fill="#395346" />
      <path d="M68 40h4v9h-4z M84 40h4v9h-4z M34 54h4v9h-4z M123 54h4v9h-4z" fill="#395346" stroke="none" />
      <path d="M77 25V10L96 14L77 19M14 81H147" fill="#cc8668" />
    </g>,
  ],
  ['Antuérpia',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="99" cy="37" r="24" fill="#e9c786" stroke="none" />
      <path d="M62 62L66 54Q60 51 58 45L54 35Q53 31 57 30Q60 30 64 38L66 31L65 19Q65 15 68 15Q71 15 73 27L74 30L76 12Q77 8 80 9Q83 9 82 14L81 29L86 14Q88 10 91 12Q94 13 92 17L88 32L95 23Q98 20 101 22Q103 24 100 28L92 40Q88 49 81 54L78 64Z" fill="#cc8668" />
      <path d="M64 38Q72 37 75 45M45 37L38 44M47 48L40 55M103 12L109 8M108 19L116 17" fill="none" />
      <path d="M30 77L47 72L57 65L73 68L83 65L97 72L123 77L115 83H41Z" fill="#bb9679" />
      <path d="M24 78H132L122 89H34Z" fill="#a8c7be" />
      <path d="M105 59Q116 62 118 69M39 60Q31 63 29 70M45 84H65M91 84H106" fill="none" />
    </g>,
  ],
  ['Bruxelas',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M47 58L41 79H37L42 56Z M113 58L119 79H123L118 56Z" fill="#a8c7be" />
      <path d="M65 92H95L90 87H70Z" fill="#bb9679" />
      <path d="M79 12L51 35L80 63L109 35L81 12 M51 35L45 56 M109 35L115 56 M51 35L80 48L109 35" fill="none" strokeWidth="4.5" />
      <circle cx="51" cy="35" r="7" fill="#a8c7be" />
      <circle cx="109" cy="35" r="7" fill="#a8c7be" />
      <circle cx="80" cy="63" r="7" fill="#a8c7be" />
      <path d="M80 12V83 M45 56L80 26L115 56L80 83Z M45 56L80 48L115 56" fill="none" strokeWidth="5" />
      <path d="M80 12V83 M45 56L80 26L115 56L80 83Z M45 56L80 48L115 56" fill="none" stroke="#e9c786" strokeWidth="2.5" />
      <path d="M80 7V2L86 4L80 6" fill="#cc8668" />
      <circle cx="80" cy="12" r="7.6" fill="#d6dcc5" />
      <circle cx="80" cy="29" r="8" fill="#a8c7be" />
      <circle cx="80" cy="48" r="8" fill="#d6dcc5" />
      <circle cx="45" cy="57" r="8.5" fill="#a8c7be" />
      <circle cx="115" cy="57" r="8.5" fill="#a8c7be" />
      <circle cx="80" cy="82" r="8.5" fill="#d6dcc5" />
      <path d="M77 9Q80 6 83 9 M77 26Q80 23 83 26 M77 45Q80 42 83 45 M42 54Q45 51 48 54 M112 54Q115 51 118 54 M77 79Q80 76 83 79" fill="none" stroke="#faf9f3" />
    </g>,
  ],
  ['Liège',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M15 78Q42 19 88 18Q125 18 146 78H136Q118 35 88 35Q51 35 27 78Z" fill="#a8c7be" />
      <path d="M15 78Q42 19 88 18Q68 12 47 23Q21 37 9 71Z" fill="#d6dcc5" />
      <path d="M27 66L21 58M39 51L34 42M52 38L48 31M62 25L67 39M79 19L80 35M95 19L94 35M110 24L107 40M124 35L119 48M135 51L129 61" fill="none" />
      <path d="M40 78V68Q40 60 52 60H97Q110 60 118 72L121 78Z" fill="#e9c786" />
      <path d="M53 66H65V71H53Z M70 66H82V71H70Z M87 66H99L105 71H87Z" fill="#395346" stroke="none" />
      <path d="M10 78H150M32 85H134" fill="none" />
    </g>,
  ],
  ['Maastricht',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M10 67H150V89H10Z" fill="#a8c7be" stroke="none" />
      <path d="M21 66H44M54 73H68M92 70H105M117 80H137M24 80H37M66 82H92" fill="none" />
      <path d="M13 46H147V76H136V68A16 16 0 0 0 104 68V76H96V68A16 16 0 0 0 64 68V76H56V68A16 16 0 0 0 24 68V76H13Z" fill="#bb9679" />
      <path d="M13 38H147V47H13Z" fill="#e9c786" />
      <path d="M30 38V47M50 38V47M70 38V47M90 38V47M110 38V47M130 38V47" fill="none" />
      <path d="M67 27Q72 23 77 28Q82 23 87 27M99 20Q103 17 107 21Q111 17 115 20" fill="none" />
    </g>,
  ],
  ['Eindhoven',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M29 82H133L128 90H34Z" fill="#d6dcc5" />
      <path d="M91 23L99 15Q102 11 106 15L119 29Q123 33 119 37L111 45Z" fill="#bb9679" />
      <path d="M94 21L113 41 M98 17L117 37 M104 15L120 32" fill="none" />
      <path d="M91 23L111 45L101 54Q96 59 93 66Q85 83 69 83Q45 84 38 66Q31 48 48 37Q57 31 69 33Q79 34 85 28Z" fill="#e9c786" />
      <path d="M49 53Q54 44 64 43" fill="none" stroke="#faf9f3" strokeWidth="2.5" />
      <path d="M38 36L31 29 M51 28L48 19 M31 48L22 45" fill="none" />
    </g>,
  ],
  ['Helmond',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M13 72H147V88H13Z" fill="#a8c7be" stroke="none" />
      <path d="M74 31L103 20L126 35L114 44Z" fill="#395346" />
      <path d="M103 34L121 29V66L103 77Z" fill="#bb9679" />
      <path d="M41 36L58 23H96L114 36Z" fill="#395346" />
      <path d="M41 36H114V77H41Z" fill="#cc8668" />
      <path d="M24 38H49V73Q38 82 24 75Z M107 38H132V75Q118 82 107 76Z" fill="#cc8668" />
      <path d="M23 38L36 14L50 38Q37 43 23 38Z M105 38L119 12L134 38Q119 43 105 38Z" fill="#395346" />
      <path d="M68 77V62A9 9 0 0 1 86 62V77Z" fill="#395346" />
      <path d="M59 45H64V53H59Z M91 45H96V53H91Z M34 49H39V58H34Z M117 49H122V58H117Z" fill="#395346" stroke="none" />
      <path d="M72 76H82L102 89H55Z" fill="#bb9679" />
      <path d="M15 80H23 M33 85H52 M109 84H126 M133 80H145" fill="none" />
    </g>,
  ],
  ['Asten',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="80" cy="49" r="36" fill="#d6dcc5" stroke="none" />
      <circle cx="80" cy="20" r="6" fill="#cc8668" />
      <circle cx="80" cy="76" r="7" fill="#bb9679" />
      <path d="M49 69Q56 64 58 59L61 44Q65 25 80 25Q95 25 99 44L102 59Q104 64 111 69Z" fill="#e9c786" />
      <ellipse cx="80" cy="69" rx="31" ry="5" fill="#cc8668" />
      <path d="M58 61Q80 55 102 61M69 45Q70 36 75 33M43 45Q34 52 43 60M35 38Q22 52 35 67M117 45Q126 52 117 60M125 38Q138 52 125 67" fill="none" />
    </g>,
  ],
  ['Valkenburg',
    <g stroke="#395346" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M13 86Q27 76 45 69Q60 61 70 54Q86 45 105 53Q122 61 148 86Z" fill="#d6dcc5" />
      <path d="M54 63L55 41L61 38V28L68 30V22L75 26L75 53Z" fill="#bb9679" />
      <path d="M75 54V42L81 39L88 43V36L95 40V17L101 20L107 13L114 18V60L105 55L98 53L91 52L83 53Z" fill="#e9c786" />
      <path d="M99 39V31A3 3 0 0 1 105 31V39Z" fill="#395346" />
      <path d="M24 86Q47 81 63 70M110 66Q123 72 133 82" fill="none" />
      <path d="M67 86V77Q69 66 80 66Q91 66 93 77V86Z" fill="#395346" />
    </g>,
  ],
]);

export function CityIllustration({ cityName }: { cityName?: string }) {
  const destination = cityName ? mapDestination(cityName) : undefined;
  const illustration = destination && illustrations.get(destination.name);

  if (illustration) return <svg className="roteiro-illustration" viewBox="0 0 160 96" aria-hidden="true">
    {illustration}
  </svg>;

  return <svg className="roteiro-illustration" viewBox="0 0 300 180" aria-hidden="true">
    <circle cx="234" cy="40" r="25" fill="#e7bd60" />
    <path d="M10 145h280v35H10z" fill="#a8c7be" />
    <g stroke="#395346" strokeWidth="2.5" strokeLinejoin="round">
      <path d="M32 145V72l30-28 30 28v73" fill="#cc8668" />
      <path d="M98 145V90l32-25 32 25v55" fill="#e9c786" />
      <path d="M170 145V52l27-28 27 28v93" fill="#d6dcc5" />
      <path d="M230 145V93l23-20 24 20v52" fill="#bb9679" />
      <path d="M190 29V10h14v19M47 83h10v18H47zm24 0h10v18H71zm41 18h10v18h-10zm25 0h10v18h-10zm46-37h9v18h-9zm21 0h9v18h-9zm-21 34h9v18h-9zm21 0h9v18h-9zm38 6h9v17h-9zm17 0h9v17h-9z" fill="#425e4f" />
      <path d="M6 145h288M69 164h62l-10 12H80z" fill="#bd7654" />
    </g>
  </svg>;
}
