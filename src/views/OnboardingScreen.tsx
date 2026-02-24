import type { Component } from "solid-js";

interface Props {
  onSelectRepo: () => void;
}

export const OnboardingScreen: Component<Props> = (props) => {
  return (
    <div class="onboarding">
      <div class="onboarding-logo">
        fpl0<span class="cursor">_</span>
        <span class="onboarding-subtitle">panel</span>
      </div>

      <blockquote class="onboarding-quote">
        <p>Select your fpl0.blog repository to begin managing content.</p>
      </blockquote>

      <div class="onboarding-action">
        <button class="btn btn-primary" onClick={props.onSelectRepo}>
          Choose Repository
        </button>
        <p class="onboarding-hint">
          The folder must contain <code>src/content/blog/</code> and <code>src/content/apps/</code>
        </p>
      </div>
    </div>
  );
};
