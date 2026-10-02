import {
  getListContactedHelpersQueryKey,
  useListContactedHelpers,
  type HelpRequest,
} from "@workspace/api-client-react";
import { AlertCircle, MessageCircle, PhoneCall, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminRequestDetailsProps {
  request: HelpRequest;
}

export function AdminRequestDetails({ request }: AdminRequestDetailsProps) {
  const {
    data: contactedHelpers,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useListContactedHelpers(request.id, {
    query: { queryKey: getListContactedHelpersQueryKey(request.id) },
  });
  const selectedHelperId = request.completedHelperId ?? null;

  return (
    <section
      className="space-y-4 border-t border-border bg-muted/20 px-4 py-4"
      data-testid={`admin-request-details-${request.id}`}
    >
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          المساعدون الذين تواصلوا مع الطلب
        </h3>

        {isLoading && (
          <div
            className="space-y-2"
            role="status"
            aria-live="polite"
            data-testid={`contacted-helpers-loading-${request.id}`}
          >
            <span className="sr-only">جارٍ تحميل قائمة المساعدين</span>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        )}

        {isError && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"
            role="alert"
            data-testid={`contacted-helpers-error-${request.id}`}
          >
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {contactedHelpers
                ? "تعذر تحديث قائمة المساعدين."
                : "تعذر تحميل قائمة المساعدين."}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
              data-testid={`retry-contacted-helpers-${request.id}`}
            >
              إعادة المحاولة
            </Button>
          </div>
        )}

        {!isLoading && !isError && (contactedHelpers?.length ?? 0) === 0 && (
          <p
            className="rounded-xl bg-white px-3 py-4 text-sm text-muted-foreground"
            role="status"
            data-testid={`contacted-helpers-empty-${request.id}`}
          >
            لا يوجد مساعدون تواصلوا مع هذا الطلب.
          </p>
        )}

        {!!contactedHelpers?.length && (
          <div className="space-y-2">
            {contactedHelpers.map((helper, index) => {
              const helperKey = helper.helperId ?? `${helper.helperName ?? "helper"}-${index}`;
              const averageRating =
                helper.rating !== null && Number.isFinite(helper.rating)
                  ? helper.rating.toFixed(1)
                  : null;
              const isWhatsapp = helper.contactMethod === "whatsapp";

              return (
                <article
                  key={helperKey}
                  className="space-y-2 rounded-xl border border-border bg-white p-3"
                  data-testid={`contacted-helper-${request.id}-${helperKey}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold text-foreground"
                        data-testid={`contacted-helper-name-${request.id}-${helperKey}`}
                      >
                        {helper.helperName ?? "الاسم غير متاح"}
                      </p>
                      <p
                        className="mt-1 text-left font-mono text-sm text-muted-foreground"
                        dir="ltr"
                        data-testid={`contacted-helper-phone-${request.id}-${helperKey}`}
                      >
                        {helper.contactPhone ?? "رقم الهاتف غير متاح"}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      data-testid={`contact-method-${request.id}-${helperKey}`}
                    >
                      {isWhatsapp ? (
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {isWhatsapp ? "واتساب" : "اتصال هاتفي"}
                    </span>
                  </div>

                  <p
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    data-testid={`helper-average-rating-${request.id}-${helperKey}`}
                  >
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
                    {averageRating === null
                      ? "لا يوجد متوسط تقييم"
                      : `متوسط التقييم: ${averageRating} / 5${
                          helper.ratingCount > 0 ? ` (${helper.ratingCount} تقييم)` : ""
                        }`}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <section
        className="space-y-3 rounded-xl border border-primary/20 bg-white p-3"
        data-testid={`selected-completion-helper-${request.id}`}
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            المساعد الذي اختاره العميل لإتمام الطلب
          </h3>
          {selectedHelperId === null ? (
            <p
              className="mt-1 text-sm text-muted-foreground"
              data-testid={`selected-helper-empty-${request.id}`}
            >
              لم يحدد العميل مساعداً لإتمام الطلب.
            </p>
          ) : (
            <div className="mt-2 space-y-1">
              <p
                className="text-sm font-medium text-foreground"
                data-testid={`selected-helper-name-${request.id}`}
              >
                {request.helperName ?? `المساعد رقم ${selectedHelperId}`}
              </p>
              <p
                className="text-left font-mono text-sm text-muted-foreground"
                dir="ltr"
                data-testid={`selected-helper-phone-${request.id}`}
              >
                {request.helperPhone ?? "رقم الهاتف غير متاح"}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">تقييم هذا الطلب</p>
          {request.completedHelperTaskRatingStars == null ? (
            <p
              className="mt-1 text-sm text-muted-foreground"
              data-testid={`task-rating-empty-${request.id}`}
            >
              {selectedHelperId === null
                ? "لا يوجد تقييم لهذا الطلب لعدم اختيار مساعد."
                : "لم يسجل العميل تقييماً لهذا الطلب."}
            </p>
          ) : (
            <div
              className="mt-1 flex items-center gap-2"
              data-testid={`task-rating-${request.id}`}
            >
              <span className="flex items-center gap-1 font-semibold text-amber-700">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                {request.completedHelperTaskRatingStars} / 5
              </span>
              <span className="text-xs text-muted-foreground">
                تقييم المهمة الحالية، وليس متوسط المساعد
              </span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}