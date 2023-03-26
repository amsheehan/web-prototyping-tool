export const addRootStylesToDocument = (doc: HTMLDocument) => {
  const { CSSStyleSheet } = doc.defaultView as any;

  const boardStyles = new CSSStyleSheet();
  boardStyles.replaceSync(OUTLET_ROOT_STYLES);

  const anyDoc = doc as any;
  anyDoc.adoptedStyleSheets = [...anyDoc.adoptedStyleSheets, boardStyles];
};

export const removeRootStylesFromDocument = (doc: HTMLDocument) => {
  const anyDoc = doc as any;
  anyDoc.adoptedStyleSheets = [];
};

const OUTLET_ROOT_STYLES = `
  body {
    font-weight: var(--co-body1-font-weight);
    font-family: var(--co-body1-font-family);
    font-style: var(--co-body1-font-style);
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: 'Roboto', sans-serif;
    -webkit-font-smoothing: subpixel-antialiased;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :host {
    display: block;
    width: 100%;
    height: 100%;
  }

  h1 {
    font-weight: var(--co-headline1-font-weight);
    font-family: var(--co-headline1-font-family);
    font-style: var(--co-headline1-font-style);
    font-size: var(--co-headline1-font-size);
    color: var(--co-headline1-color);
  }

  h2 {
    font-weight: var(--co-headline2-font-weight);
    font-family: var(--co-headline2-font-family);
    font-style: var(--co-headline2-font-style);
    font-size: var(--co-headline2-font-size);
    color: var(--co-headline2-color);
  }

  h3 {
    font-weight: var(--co-headline3-font-weight);
    font-family: var(--co-headline3-font-family);
    font-style: var(--co-headline3-font-style);
    font-size: var(--co-headline3-font-size);
    color: var(--co-headline3-color);
  }

  h4 {
    font-weight: var(--co-headline4-font-weight);
    font-family: var(--co-headline4-font-family);
    font-style: var(--co-headline4-font-style);
    font-size: var(--co-headline4-font-size);
    color: var(--co-headline4-color);
  }

  h5 {
    font-weight: var(--co-headline5-font-weight);
    font-family: var(--co-headline5-font-family);
    font-style: var(--co-headline5-font-style);
    font-size: var(--co-headline5-font-size);
    color: var(--co-headline5-color);
  }

  h6 {
    font-weight: var(--co-headline6-font-weight);
    font-family: var(--co-headline6-font-family);
    font-style: var(--co-headline6-font-style);
    font-size: var(--co-headline6-font-size);
    color: var(--co-headline6-color);
  }

  a {
    color: var(--co-primary);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  i {
    user-select: none;
  }

  iframe {
    border: none;
  }

  .cd-fit-content {
    width: fit-content;
    height: fit-content;
  }

  .cd-generic-div {
    overflow: initial;
    height: initial;
  }

  cd-outlet {
    display: contents;
  }

  // These styles default the root of a board and portal to be width/height 100%
  // For boards this is so that they fill the entire iframe
  // For portals this is so they expand to fill the entire tab/step/panel etc
  .outlet-root > .inner-root,
  .cd-portal-wrapper > .inner-root {
    width: 100%;
    height: 100%;
  }

  // Amount of padding in the component preview of the code component editor
  $codeCompPadding: 24px;

  // This class is added the body of the Code component outlet iframe
  // to center the injected custom element
  .center-code-component {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $codeCompPadding;

    > * {
      width: 100%;
      height: 100%;
    }

    &::after {
      content: '';
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
      pointer-events: none;
      transition: border-color 200ms ease;
      border: $codeCompPadding solid rgba(0, 0, 0, 0.1);
      position: absolute;
      z-index: -1;
    }

    &:hover::after {
      border: $codeCompPadding solid rgba(0, 0, 0, 0);
    }
  }

  .center-code-component.cd-preview-mode-active::after {
    content: none;
  }

  // DO NOT REMOVE
  // This is used inside mat button to conditionally add a mat-menu
  .co-mat-menu-trigger {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    /// Do not change to transparent, hit targets may not work
    background: rgba(0, 0, 0, 0);
  }

  // Utility class for setting display: contents
  .cd-display-contents {
    display: contents;
  }

  // Action Hint Canvas Styles
  // see renderer/src/app/interactions
  .co-hint-canvas {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 999999;
    pointer-events: none;
  }
`;
