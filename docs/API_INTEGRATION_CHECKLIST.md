# API Integration Checklist

Status: setup guide
Last updated: 2026-07-01

This file tracks the external integrations required for the operator-run Google Maps campaign platform. Do not paste or commit plaintext API keys here. Store secrets only in local `.env` or the deployment secret manager.

## 1. Google Sheets API

- Purpose: Import advertiser request rows from the Google Sheet into admin campaigns.
- Current local status: service account created, spreadsheet shared, read access verified.
- Official setup/docs:
  - https://developers.google.com/workspace/sheets/api/quickstart/python
  - https://developers.google.com/workspace/guides/create-credentials
  - https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get
- User must confirm:
  - Google Cloud project is selected or created.
  - Google Sheets API is enabled.
  - Service account is created.
  - The request spreadsheet is shared with the service account email.
  - Service account JSON is downloaded and stored outside git.
- Expected app env:
  - `GOOGLE_SHEETS_CREDENTIALS_PATH` for local development with a downloaded JSON key file.
  - `GOOGLE_SHEETS_CLIENT_EMAIL`
  - `GOOGLE_SHEETS_PRIVATE_KEY`
  - `GOOGLE_SHEETS_SPREADSHEET_ID`
  - `GOOGLE_SHEETS_RANGE`
- Implementation target:
  - `POST /api/admin/sheet-imports/google-map-review/sync`

## 2. Google Places API

- Purpose: Resolve Google Maps URL or search keyword to a canonical Place ID and place snapshot.
- Current local status: provider module exists and sheet dry-run can attach Google Places previews when `GOOGLE_PLACES_API_KEY` is present.
- Official setup/docs:
  - https://developers.google.com/maps/documentation/places/web-service/get-api-key
  - https://developers.google.com/maps/documentation/places/web-service/place-details
  - https://developers.google.com/maps/documentation/places/web-service/text-search
  - https://developers.google.com/maps/documentation/places/web-service/place-id
- User must confirm:
  - Billing is enabled for the Google Cloud project.
  - Places API (New) is enabled.
  - API key is created and restricted.
  - Quotas/budget alerts are reviewed.
- Expected app env:
  - `GOOGLE_PLACES_API_KEY`
- Implementation target:
  - `lib/domain/external-place-providers.ts`
  - Sheet import should call Google resolve before campaign activation.

## 3. SMS Sending API

- Purpose: Send OTP codes to reviewers.
- Recommended Korean provider option:
  - Naver Cloud SENS: https://www.ncloud.com/product/applicationService/sens
  - SENS guide: https://guide.ncloud-docs.com/docs/en/sens-overview
  - SENS SMS message guide: https://guide.ncloud-docs.com/docs/en/sens-smsmessage
- Alternative:
  - Aligo SMS API spec: https://smartsms.aligo.in/admin/api/spec.html
- User must confirm:
  - Provider selected: Naver Cloud SENS or Aligo.
  - Sender number is registered/approved.
  - Test SMS can be sent from provider console.
  - Pricing and anti-spam obligations are reviewed.
- Expected app env, if Naver Cloud SENS:
  - `SMS_PROVIDER=naver-sens`
  - `NAVER_CLOUD_ACCESS_KEY`
  - `NAVER_CLOUD_SECRET_KEY`
  - `NAVER_SENS_SERVICE_ID`
  - `SMS_SENDER_NUMBER`
- Expected app env, if Aligo:
  - `SMS_PROVIDER=aligo`
  - `ALIGO_USER_ID`
  - `ALIGO_API_KEY`
  - `SMS_SENDER_NUMBER`
- Implementation target:
  - `POST /api/auth/otp/request`

## 4. Google Cloud Vision OCR

- Purpose: Extract receipt text from uploaded receipt images.
- Official setup/docs:
  - https://docs.cloud.google.com/vision/docs/setup
  - https://docs.cloud.google.com/vision/docs/ocr
- User must confirm:
  - Vision API is enabled.
  - API key or service account auth approach is selected.
  - Billing/quota alerts are reviewed.
  - Privacy notice for receipt image processing remains visible.
- Expected app env:
  - `OCR_PROVIDER=vision`
  - `GOOGLE_VISION_API_KEY`
- Implementation target:
  - `lib/ocr/vision.ts`
  - `POST /api/receipts/ocr`

## 5. Campaign Google Maps Link

- Purpose: Open the exact Google Maps place for campaign reviewers.
- Current local status: sheet apply creates linked `Business`, `ExternalPlace(platform=GOOGLE)`, `Campaign`, and campaign codes; reviewer flow opens the linked Google Maps URL.
- Official docs:
  - https://developers.google.com/maps/documentation/urls/get-started
- User must confirm:
  - Campaigns store an exact `googleMapsUrl` or Place ID.
  - Review flow opens campaign place URL, not just business name search.
  - Link uses `query_place_id` when Place ID is available.
- Expected app env:
  - None beyond Google Places setup.
- Implementation target:
  - `app/r/[slug]/page.tsx`
  - `components/flow/ReviewFlow.tsx`
  - `lib/domain/operator-campaigns.ts`

## 6. Anthropic Claude API

- Purpose: Generate review draft text from the reviewer's own visit inputs.
- Official setup/docs:
  - https://platform.claude.com/
  - https://platform.claude.com/docs/en/get-started
  - https://docs.anthropic.com/en/api/messages
- User must confirm:
  - Anthropic Console account is available.
  - Billing is set.
  - API key is created.
  - Model choice and monthly budget are reviewed.
- Expected app env:
  - `ANTHROPIC_API_KEY`
  - `AI_MODEL`
- Implementation target:
  - `lib/domain/draft.ts`
  - `POST /api/drafts`
- Compliance note:
  - Draft input must use only the reviewer's submitted visit facts. Do not invent experiences.

## 7. Real Payout / Withdrawal API

- Purpose: Pay reviewer settlement requests.
- Recommended provider option:
  - Toss Payments payouts: https://docs.tosspayments.com/guides/v2/payouts
  - Toss Payments API reference: https://docs.tosspayments.com/reference
- Alternatives to evaluate:
  - Payple developer center: https://docs.payple.kr/
  - Eximbay payout API: https://developer.eximbay.com/eximbay/api_list/reference_pa.html
  - Hecto Financial: https://www.hectofinancial.co.kr/
- User must confirm:
  - Provider selected.
  - Business/KYC contract requirements are understood.
  - Test credentials are issued.
  - Required recipient data and privacy policy are confirmed.
- Expected app env, if Toss Payments:
  - `PAYOUT_PROVIDER=toss`
  - `TOSS_PAYOUT_SECRET_KEY`
  - `TOSS_PAYOUT_SECURITY_KEY`
- Implementation target:
  - `POST /api/settlements`
  - `POST /api/admin/settlements/[id]`
  - payout status sync/webhook endpoint

## 8. Naver Local Search API

- Purpose: Find matching Naver SmartPlace candidates for the same place.
- Current local status: Client ID/Secret are configured locally and admin campaign cards can preview Naver Local Search candidates.
- Official setup/docs:
  - https://developers.naver.com/docs/common/openapiguide/appregister.md
  - https://developers.naver.com/docs/serviceapi/search/local/local.md
  - https://developers.naver.com/main/
- User must confirm:
  - Naver Developers application is registered.
  - Search API is added to the application.
  - Client ID and Client Secret are available.
  - Daily call limit is sufficient.
- Expected app env:
  - `NAVER_CLIENT_ID`
  - `NAVER_CLIENT_SECRET`
- Implementation target:
  - `lib/domain/external-place-providers.ts`
  - `POST /api/business/[id]/places/naver/candidates`
  - `POST /api/admin/campaigns/[campaignId]/naver-candidates`
- MVP note:
  - This is optional for the Google Maps campaign MVP.

## 9. Google Business Profile Reviews API

- Purpose: Optional future feature for authenticated business owners/managers to list and reply to their own Google Business Profile reviews.
- Official setup/docs:
  - https://developers.google.com/my-business
  - https://developers.google.com/my-business/content/overview
  - https://developers.google.com/my-business/content/review-data
  - https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
- User must confirm:
  - Whether this feature is actually needed.
  - Google account has Owner/Manager access to the relevant Business Profile locations.
  - OAuth consent and scopes are approved.
  - This API will not be used to post reviews on behalf of reviewers.
- Expected app env:
  - `GOOGLE_BUSINESS_PROFILE_CLIENT_ID`
  - `GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET`
  - OAuth redirect URL config
- Implementation target:
  - Future admin analytics/review management module.
- MVP note:
  - Exclude from first launch unless business-owner OAuth becomes a product requirement.

## Recommended Setup Order

1. Google Sheets API
2. Google Places API
3. Campaign Google Maps Link
4. Anthropic Claude API
5. Google Cloud Vision OCR
6. SMS Sending API
7. Real Payout / Withdrawal API
8. Naver Local Search API
9. Google Business Profile Reviews API

## Safety Rules

- Never commit secret keys.
- Do not share plaintext keys in chat.
- Use restricted API keys where possible.
- For Google review campaigns, reward only platform participation/visit proof/internal feedback, not Google review posting, star rating, or positive wording.
