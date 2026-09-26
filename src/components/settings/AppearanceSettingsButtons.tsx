"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { AppearanceSettingsModal } from "@/components/settings/AppearanceSettingsModal";

/** 테마 색상/폰트 설정 진입점. 학생·교사 화면 양쪽에서 동일하게 사용한다. */
export function AppearanceSettingsButtons({
  className = "header-icon-action",
}: {
  className?: string;
}) {
  const { session, profile, refreshProfile } = useAuth();
  const showToast = useToast();
  const [modalOpen, setModalOpen] = useState(false);

  async function handleSave(
    hex: string | null,
    fontKey: string | null,
    fontSizeLevel: number,
    fontWeightLevel: number,
  ) {
    if (!session) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        theme_color: hex,
        font_family: fontKey,
        font_size_level: fontSizeLevel,
        font_weight_level: fontWeightLevel,
      })
      .eq("id", session.user.id);
    if (error) {
      showToast("설정 저장에 실패했습니다.", "error");
      return;
    }
    await refreshProfile();
    showToast("설정이 적용되었습니다.", "success");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        title="테마 및 폰트 설정"
        aria-label="테마 및 폰트 설정"
        aria-haspopup="dialog"
        aria-expanded={modalOpen}
        className={className}
      >
        <Settings className="w-4 h-4" aria-hidden="true" />
      </button>

      <AppearanceSettingsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentColor={profile?.theme_color ?? null}
        currentFontKey={profile?.font_family ?? null}
        currentFontSizeLevel={profile?.font_size_level ?? null}
        currentFontWeightLevel={profile?.font_weight_level ?? null}
        onSave={handleSave}
      />
    </>
  );
}
