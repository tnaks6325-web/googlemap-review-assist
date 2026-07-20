const ADMIN_TIME_ZONE = "Asia/Seoul";

const adminDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const adminDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatAdminDate(value: string | Date) {
  return adminDateFormatter.format(new Date(value));
}

export function formatAdminDateTime(value: string | Date) {
  return adminDateTimeFormatter.format(new Date(value));
}
