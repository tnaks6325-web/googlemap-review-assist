export function ReviewerLandingArtwork() {
  return (
    <div className="relative min-h-[250px] flex-1 overflow-hidden bg-[linear-gradient(to_bottom,rgba(255,255,255,0.62),transparent_110px)]">
      <svg
        aria-label="스마트폰으로 맛집 리뷰를 작성하는 사람"
        role="img"
        viewBox="0 0 430 260"
        className="absolute inset-x-0 top-[3%] h-[97%] w-full"
      >
        <defs>
          <linearGradient id="reviewer-shirt" x1="0" x2="1">
            <stop stopColor="#2678ef" />
            <stop offset="1" stopColor="#65a7fa" />
          </linearGradient>
          <filter id="reviewer-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="7"
              stdDeviation="8"
              floodColor="#375b88"
              floodOpacity=".12"
            />
          </filter>
        </defs>

        <path
          d="M24 197C85 139 135 186 190 119S309 56 414 101"
          fill="none"
          stroke="#c8d5e4"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="5 9"
        />
        <ellipse cx="219" cy="230" rx="93" ry="14" fill="#dce4ee" />

        <g data-place-icon="cafe" transform="translate(44 62)" filter="url(#reviewer-soft-shadow)">
          <circle cx="32" cy="32" r="31" fill="#fff" />
          <path
            d="M19 23h23v15a8 8 0 0 1-8 8h-7a8 8 0 0 1-8-8V23Z"
            fill="#e8f3ff"
            stroke="#2878f0"
            strokeWidth="2"
          />
          <path
            d="M42 28h4a6 6 0 0 1 0 12h-4M25 17c-3-4 3-6 0-10M34 17c-3-4 3-6 0-10"
            fill="none"
            stroke="#2878f0"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>

        <g
          data-place-icon="restaurant"
          transform="translate(327 50)"
          filter="url(#reviewer-soft-shadow)"
        >
          <circle cx="31" cy="31" r="30" fill="#fff" />
          <path
            d="M18 17v14M24 17v14M18 24h6M21 31v14M39 17v28M34 17c0 8 2 12 5 12"
            fill="none"
            stroke="#00a985"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </g>

        <g
          data-place-icon="dessert"
          transform="translate(326 159)"
          filter="url(#reviewer-soft-shadow)"
        >
          <circle cx="27" cy="27" r="26" fill="#fff" />
          <path
            d="M15 36h25L35 21H20l-5 15Z"
            fill="#fff0d8"
            stroke="#f39a25"
            strokeWidth="2"
          />
          <path
            d="M19 24c4-5 12-5 17 0M27 20v-5"
            fill="none"
            stroke="#f39a25"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="28" cy="13" r="3" fill="#f05a6b" />
        </g>

        <g filter="url(#reviewer-soft-shadow)">
          <path d="M158 224c5-47 22-75 60-75s59 27 65 75H158Z" fill="url(#reviewer-shirt)" />
          <circle cx="217" cy="106" r="35" fill="#ffd7b8" />
          <path
            d="M184 106c-1-28 15-45 38-45 20 0 34 13 35 34-15 2-25-3-34-14-9 15-23 23-39 25Z"
            fill="#26374d"
          />
          <path
            d="M188 99c-7-2-10 4-7 11s8 8 12 5M248 99c7-2 10 4 7 11s-8 8-12 5"
            fill="#ffd7b8"
          />
          <circle cx="205" cy="108" r="2" fill="#38485c" />
          <circle cx="229" cy="108" r="2" fill="#38485c" />
          <path
            d="M211 121c5 4 10 4 15 0"
            fill="none"
            stroke="#d5786f"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M180 178c-12 12-19 27-22 46M255 177c15 11 23 27 28 47"
            fill="none"
            stroke="#1e69d6"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <rect x="197" y="158" width="43" height="70" rx="8" fill="#20344e" stroke="#fff" strokeWidth="4" />
          <rect x="202" y="165" width="33" height="49" rx="4" fill="#eef5ff" />
          <path
            d="m207 187 6 6 15-15"
            fill="none"
            stroke="#2878f0"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="218.5" cy="220" r="2.5" fill="#8aa1bb" />
        </g>

        <g transform="translate(110 20)" filter="url(#reviewer-soft-shadow)">
          <rect width="143" height="38" rx="19" fill="#fff" />
          <text x="18" y="25" fill="#ffb622" fontSize="18" letterSpacing="2">
            ★★★★★
          </text>
          <circle cx="119" cy="19" r="10" fill="#e9f9f5" />
          <path
            d="m114 19 3 3 6-7"
            fill="none"
            stroke="#00aa85"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
