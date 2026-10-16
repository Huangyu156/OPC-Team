import React from 'react';
import { OverflowText, Icon, ScrollArea } from '@opc-team/ui';
import { FolderOpen } from 'lucide-react';
import type { MiniAppBubbleCustomization } from '@/app/scenes/miniapps/miniAppStore';
import { renderMiniAppIcon } from '@/app/scenes/miniapps/utils/miniAppIcons';
import { useChatInputState } from '@/flow_chat/store/chatInputStateStore';
import { computeFlowChatInputStackFooterPx } from '@/flow_chat/utils/flowChatScrollLayout';

interface MiniAppBubbleWelcomeProps {
  appName: string;
  appDescription?: string;
  appIcon?: string;
  showIcon?: boolean;
  customization?: MiniAppBubbleCustomization;
  workspacePath?: string;
  onSuggestion: (prompt: string) => void;
}

/** Keep aligned with the block padding on `.opc-fmc__miniapp-welcome-content`. */
const WELCOME_CONTENT_BLOCK_PADDING_PX = 36;

/**
 * Host-rendered empty state for an Agentic MiniApp session. MiniApps provide a
 * bounded declarative model through app.chat.claimComposer; they never inject
 * markup into the shared conversation surface.
 */
export const MiniAppBubbleWelcome: React.FC<MiniAppBubbleWelcomeProps> = ({
  appName,
  appDescription,
  appIcon = 'Box',
  showIcon = true,
  customization,
  workspacePath,
  onSuggestion,
}) => {
  const welcome = customization?.welcome;
  const title = welcome?.title || appName;
  const description = welcome?.description || appDescription;
  const workspaceLabel = welcome?.workspaceLabel || (workspacePath ? appName : '');
  const suggestions = welcome?.suggestions || [];
  const inputHeight = useChatInputState(state => state.inputHeight);
  const inputClearance = computeFlowChatInputStackFooterPx(inputHeight);

  return (
    <ScrollArea className="opc-fmc__miniapp-welcome" data-opc-component="miniapp-bubble-welcome" data-opc-part="root">
      <div
        className="opc-fmc__miniapp-welcome-content"
        style={{
          paddingBottom: `${WELCOME_CONTENT_BLOCK_PADDING_PX + inputClearance}px`,
        }}
      >
        {showIcon && <div
          className="opc-fmc__miniapp-welcome-icon"
          data-opc-component="miniapp-bubble-welcome"
          data-opc-part="icon"
          aria-hidden="true"
        >
          {renderMiniAppIcon(appIcon, 28)}
        </div>}

        {title !== appName && (
          <div className="opc-fmc__miniapp-welcome-eyebrow" data-opc-component="miniapp-bubble-welcome" data-opc-part="eyebrow">{appName}</div>
        )}
        <h2 data-opc-component="miniapp-bubble-welcome" data-opc-part="title">{title}</h2>
        {description && <p className="opc-fmc__miniapp-welcome-description" data-opc-component="miniapp-bubble-welcome" data-opc-part="description">{description}</p>}

        {workspaceLabel && workspacePath && (
          <div
            className="opc-fmc__miniapp-workspace"
            data-opc-component="miniapp-bubble-welcome"
            data-opc-part="workspace"
            title={workspacePath}
            data-workspace-path={workspacePath}
          >
            <FolderOpen size={13} aria-hidden="true" />
            <OverflowText>{workspaceLabel}</OverflowText>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="opc-fmc__miniapp-suggestions" data-opc-component="miniapp-bubble-welcome" data-opc-part="suggestions">
            {welcome?.suggestionsLabel && (
              <div className="opc-fmc__miniapp-suggestions-label" data-opc-component="miniapp-bubble-welcome" data-opc-part="suggestionsLabel">
                {welcome.suggestionsLabel}
              </div>
            )}
            <div className="opc-fmc__miniapp-suggestions-list" data-opc-component="miniapp-bubble-welcome" data-opc-part="suggestionsList">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.label}:${index}`}
                  type="button"
                  className="opc-fmc__miniapp-suggestion"
                  data-opc-component="miniapp-bubble-welcome"
                  data-opc-part="suggestion"
                  title={suggestion.prompt}
                  onClick={() => onSuggestion(suggestion.prompt)}
                >
                  <span>{suggestion.label}</span>
                  <Icon name="arrow-up-right" size="xs" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default MiniAppBubbleWelcome;
