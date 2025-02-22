import { schema } from "../schema/base.js"
import { buttonIcons } from "../../ui/button-icons.js"
import { fragmentFromString } from "../../doc.js";
import { cloneSelection } from "./utils/selection"


export class ToolbarView {
  constructor(mode, buttons, editorView) {
    this.mode = mode;
    this.toolbarCommands = this.getToolbarCommands();

    this.toolbarPopups = this.getToolbarPopups()
    this.selection = null;

    this.buttons = buttons.map(button => { return { button, command: this.toolbarCommands[button], dom: () => fragmentFromString(getButtonHTML(button)).firstChild } })

    this.populateForms = this.getPopulateForms();

    // Default empty formHandlers, listeners (subclasses should override)
    this.formHandlers = this.getFormHandlers();

    // Bind event handlers
    this.bindFormHandlers();

    this.formEventListeners = this.getFormEventListeners();

    // for PM stuff
    this.editorView = editorView;

    // for DOM stuff
    this.documentBody = editorView?.dom.parentNode ?? document.body;

    this.dom = document.createElement("div");
    this.dom.id = 'document-editor';
    this.dom.className = 'do editor-toolbar editor-toolbar-view-transition';

    this.addToolbar();

    this.selectionHandler = (e) => this.selectionUpdate(editorView);

    this.updateToolbarVisibilityHandler = (e) => this.updateToolbarVisibility(e);
    // Attach the event listener only in social mode, find a better way of doing this
    // this is still being attached on author mode, or not cleaned up properly
    // if (mode !== "author") {
    //   document.addEventListener("selectionchange", this.selectionHandler);
    // }

    document.removeEventListener("keyup", this.selectionHandler);
    document.removeEventListener("mouseup", this.selectionHandler);


    document.addEventListener("keyup", this.selectionHandler); 
    document.addEventListener("mouseup", this.selectionHandler); 
    this.updateToolbarVisibility = this.updateToolbarVisibility.bind(this);
    this.formClickHandler = this.formClickHandler.bind(this);
    // this.cleanupToolbar = this.cleanupToolbar.bind(this);
    // this.clearToolbarForm = this.clearToolbarForm.bind(this);

    document.removeEventListener("mousedown", this.updateToolbarVisibilityHandler);
    document.addEventListener("mousedown", this.updateToolbarVisibilityHandler);
  }

  getToolbarPopups() {
    return {}
  }

  getToolbarCommands() {
    return {}
  }

  getFormHandlers() {
    return [];
  }

  bindFormHandlers() {
    this.getFormHandlers().forEach(handler => {
      this[handler.name] = handler.fn.bind(this);
    });
  }

  getFormEventListeners() {
    return {};
  }

  updateToolbarVisibility() {
    return;
  }

  addToolbar() {
    var ul = document.querySelector('.editor-toolbar-actions');

    if (ul) { 
      ul.parentNode.removeChild(ul); 
    }

    const toolbarForms = this.dom.getElementsByClassName('editor-toolbar-form');

    Array.from(toolbarForms).forEach((form) => {
      this.dom.removeChild(form);
    });

    this.ul = document.createElement('ul');
    this.ul.classList.add('editor-toolbar-actions');
    this.dom.appendChild(this.ul);
    this.documentBody.appendChild(this.dom);

    this.buttons.forEach(({ button, command, dom }) => {
      const buttonNode = dom();
      buttonNode.id = 'editor-button-' + button;

      const li = document.createElement("li");
      li.appendChild(buttonNode);
      document.querySelector('.editor-toolbar-actions').appendChild(li);

      // TODO: figure this out, perhaps if updateButtonState[mode] or something
    //   // if (pm) {
      this.updateButtonState(schema, buttonNode, button,this.editorView);
    // // }
      const formControlsHTML = toolbarPopups[button];

      if (formControlsHTML) {
        const toolbarForm = document.createElement('form');
        toolbarForm.classList.add('editor-toolbar-form');
        toolbarForm.id = 'editor-toolbar-form-' + button;
        toolbarForm.appendChild(fragmentFromString(`<fieldset>${formControlsHTML({ button })}</fieldset>`));

        this.dom.appendChild(toolbarForm);

        // Populate forms where applicable
        if (this.populateForms[button]) {
          this.populateForms[button](toolbarForm, this.editorView.state);
        }

        // Add event listeners where applicable
        if (this.formEventListeners[button]) {
          this.formEventListeners[button].forEach((listener) => {
            toolbarForm.addEventListener(listener.event, listener.callback);
          })
        }
      }

      buttonNode.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        var buttonActive = e.target.closest('button');

        if (buttonActive) {
          this.editorView?.focus();

          buttonActive.classList.toggle('editor-button-active');

          //If button is connected to a ProseMirror command (see `toolbarCommands`), we call it.
          if (command) {
            command(this.editorView.state, this.editorView.dispatch, this.editorView);
          }

          //Update active class on non-clicked buttons to see if they should be active or not
          this.buttons.forEach(({button: btn}) => {
            const btnNode = this.dom.querySelector(`#${'editor-button-' + btn}`);

            if (toolbarPopups[btn]) {
              //Except the one that we've just clicked.
              if (btn === button) return;
              //Clean up all or any that's active.
              btnNode.classList.remove('editor-button-active');
            }
            else {
              //Checks if the other buttons are connected to an applied node/mark, then make active.
              // TODO: if pm do this
              this.updateButtonState(schema, btnNode, btn, this.editorView);
            }
          })

          //If there is a popup (toolbarForm) associated with this button.
          if (toolbarPopups[button]) {
            const toolbarForm = this.dom.querySelector(`#editor-toolbar-form-${button}`);
            // Loop over popups to hide non-active ones.
            this.buttons.forEach(({ button: b}) => {
              // Ignore current popup (corresponding to clicked button).
              if (b === button) return;

              // Hide all other popups.
              else if (toolbarPopups[b]) {
                this.dom.querySelector(`#editor-toolbar-form-${b}`).classList.remove('editor-toolbar-form-active');
              }
            })

            const margin = 10;

            // Toggle visibility of current popup.
            toolbarForm.classList.toggle('editor-toolbar-form-active');

            //Position it now because it needs to be near the button that was clicked.
            const toolbarHeight = this.dom.offsetHeight;
            const toolbarWidth = this.dom.offsetWidth;
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const selectionPosition = range.getBoundingClientRect();

            toolbarForm.style.left = `${(toolbarWidth / 2 ) - (toolbarForm.offsetWidth / 2)}px`;

            toolbarForm.style.right = 'initial';

            // 1. if there is space for toolbar above selection, and space for popup below selection, do that - when selection is in the middle, ideal scenario
            if ((selectionPosition.top >= toolbarHeight + (margin * 2)) && (window.innerHeight - selectionPosition.bottom >= toolbarForm.offsetHeight + (margin * 2))) { // this condition is right but
// console.log("condition 1")
              toolbarForm.style.top = `${toolbarHeight + selectionPosition.height + (margin * 1.5)}px`;
            }
            // 2. if there is space for toolbar above selection, but no space for popup below, it's a given that there's space for popup above toolbar (because it means the selection is very close to the bottom) - when selection is very close to the bottom
            else if (selectionPosition.top >= toolbarHeight + (margin * 2) && (window.innerHeight - selectionPosition.bottom < toolbarForm.offsetHeight + (margin * 2))) {
// console.log("condition 2")
              toolbarForm.style.top = `-${toolbarForm.offsetHeight + (margin / 2)}px`;
            }
            // 3. if no space for toolbar above selection, put it below selection, and popup below toolbar - when selection is very close to the top
            else {
// console.log("condition 3")
              toolbarForm.style.top = `${toolbarHeight + (margin / 2)}px`;
            }
          }
        }
      });
    });

    // this.updateToolbarVisibility();
  }

  getPopulateForms() {
    return {};
  }

  // hides toolbar, updates state of all buttons, hides and resets all forms. 
  cleanupToolbar() {
    this.dom.classList.remove("editor-toolbar-active");

// update buttons
    this.buttons.forEach(({button}) => {
      this.clearToolbarButton(button);
// clear forms
      if (this.toolbarPopups[button]) {
        const toolbarForm = document.querySelector('#editor-toolbar-form-' + button + '.editor-toolbar-form-active');
        if (toolbarForm) {
          this.clearToolbarForm(toolbarForm);
        }
      }
    })
  }

  //TODO: Clear active buttons where applicable (not active marks) after clicking away, hide popups. one fn to clear eveything.
  //FIXME: select text from right to left of a paragraph. while still click is held, let go on the left outside of the selected text. the selection disappears.
  updateToolbarVisibility() {
    return;
  }

  updateButtonState () {
    return;
  }

  // Called when there is a state change, e.g., added something to the DOM or selection change.
  update(view) {
    return;
  }

  // check for selection changes to position toolbar and attach event listeners to the popups, which need to have the latest selection
  selectionUpdate(view) {
    // const handleSelectionEnd = () => {


      const selection = window.getSelection();
      const isSelection = selection && !selection.isCollapsed;
      // Hide the toolbar when there is no selection
      if (!isSelection) {
        // if (this.dom.classList.contains('editor-toolbar-active')) {
        //   // this.dom.classList.remove("editor-toolbar-active");
        //   // console.log("selection update, cleanup toolbar")
        //   // this.cleanupToolbar();
        // }
        return;
      }

      //If selection is empty string or a new line
      if (!selection.rangeCount || !selection.toString().length || selection.toString().charCodeAt(0) === 10) {
        return;
      }

      
      //TODO: Revisit
      // const allowMultiNodeSelection = false;
      // if (allowMultiNodeSelection) {
      //   return;
      // }

      if (!this.isSelectionsStartEndRangesWithinSameParent(selection)) {
        return;
      }

      this.selection = cloneSelection();

      //Get information on the selection to position the toolbar.
      const range = selection.getRangeAt(0);
      const selectedPosition = range.getBoundingClientRect();
      const toolbarHeight = this.dom.offsetHeight;
      const toolbarWidth = this.dom.offsetWidth;
      const margin = 10;

      // Display the toolbar
      this.dom.classList.add("editor-toolbar-active");

      this.dom.style.left = `${selectedPosition.left + (selectedPosition.width / 2 ) - (toolbarWidth / 2)}px`;

      // Cleanup the arrow from previous toolbar poisitioning
      this.dom.classList.remove("toolbar-arrow-over", "toolbar-arrow-under");

      //Normally we want to position the toolbar above the selection, otherwise below the selection.
      //Put the toolbar above the selection if there is enough space in the viewport above the position of the selected text's rectangle.
  
      //1 & 2
      if (selectedPosition.top >= toolbarHeight + (margin * 2)) {
        this.dom.style.top = `${selectedPosition.top + window.scrollY - toolbarHeight - margin}px`;
        //This is just the arrow below the toolbar pointing at the selection.
        this.dom.classList.add("toolbar-arrow-under");
      }
      //Put the toolbar below the selection.
      // 3
      else {
        this.dom.style.top = `${selectedPosition.bottom + window.scrollY + margin}px`;
        this.dom.classList.add("toolbar-arrow-over");
      }

      this.dom.style.right = 'initial';
    // }

    // document.addEventListener("keyup", handleSelectionEnd); 
    // document.addEventListener("mouseup", handleSelectionEnd); 
  }

  isSelectionsStartEndRangesWithinSameParent(selection) {
    selection = selection || window.getSelection();

    const startParentNode = selection.getRangeAt(0).startContainer.parentNode;
    const endParentNode = selection.getRangeAt(selection.rangeCount - 1).endContainer.parentNode;

    console.log(startParentNode, endParentNode)
    return startParentNode === endParentNode; // Returns true if both are the same
  }

  clearToolbarButton(button) {
    const btnNode = this.dom.querySelector(`#${'editor-button-' + button}`);

    if (toolbarPopups[button]) {
      //Clean up all or any that's active.
      btnNode.classList.remove('editor-button-active');
    }

    //Checks if the other buttons are connected to an applied node/mark, then make active.
    this.updateButtonState(schema, btnNode, button, this.editorView);

  }

  clearToolbarForm(toolbarForm) {
    toolbarForm.classList.remove('editor-toolbar-form-active');
    toolbarForm.removeAttribute('style');
    toolbarForm.reset();
    // TOD
    // if (toolbarForm is editor mode) {
    // this.editorView.focus();
    // }
  }

  formClickHandler(e, button) {
    var buttonNode = e.target.closest('button');
    
    if (buttonNode) {
      var buttonClasses = buttonNode.classList;
      
      if (buttonNode.type !== 'submit') {
        e.preventDefault();
        e.stopPropagation();
      }

      if (buttonClasses.contains('editor-toolbar-cancel')) {
        const toolbarForm = buttonNode.closest('form');
        this.clearToolbarForm(toolbarForm);
        this.clearToolbarButton(button);
      }
    }
  }

  destroy() {
    //this.dom is #document-toolbar
    //TODO: Also remove itself
    this.documentBody.removeChild(this.dom);
    document.removeEventListener("selectionchange", this.selectionHandler);
  }
}

//Given a button action, generates an HTML string for the button including an icon and text.
function getButtonHTML(button, buttonClass, buttonTitle, buttonTextContent, options = {}) {
  if (!button) {
    throw new Error('Need to pass button.');
  }

  const textContent = buttonTextContent || buttonIcons[button].textContent;
  const title = buttonTitle || buttonIcons[button].title;
  const icon = buttonIcons[button].icon;

  const buttonContent = (!icon && !textContent) ? button : `${icon ? icon : ''} ${textContent ? `<span>${textContent}</span>` : ''}`;

  return `<button${buttonClass ? ` class="${buttonClass}"` : ''} title="${title}"${options.type ? ` type="${options.type}"` : ''}>${buttonContent}</button>`;
}


const toolbarPopups = {
  a: (options) => `<legend>Add a link</legend>
    <label for="link-a-href">URL</label> <input class="editor-toolbar-input" id="link-a-href" name="link-a-href" required="" placeholder="Paste or type a link (URL)" type="url" />
    <label for="link-a-title">Title</label> <input class="editor-toolbar-input" id="link-a-title" name="link-a-title" placeholder="Add advisory information for the tooltip." type="text" />
    ${getButtonHTML('submit', 'editor-toolbar-submit', 'Save', 'Save', { type: 'submit' })}
    ${getButtonHTML('cancel', 'editor-toolbar-cancel', 'Cancel', 'Cancel', { type: 'button' })}
  `,

  blockquote: (options) => `<legend>Add the source of the blockquote</legend>
    <label for="link-blockquote-cite">URL</label> <input class="editor-toolbar-input" id="link-blockquote-cite" name="link-blockquote-cite" placeholder="Paste or type a link (URL)" type="url"  pattern="https?://.+" oninvalid="setCustomValidity('Please enter a valid URL')" 
   oninput="setCustomValidity('')" />
    ${getButtonHTML('submit', 'editor-toolbar-submit', 'Save', 'Save', { type: 'submit' })}
    ${getButtonHTML('cancel', 'editor-toolbar-cancel', 'Cancel', 'Cancel', { type: 'button' })}
  `,

  q: (options) => `<legend>Add the source of the quote</legend>
    <label for="link-q-cite">URL</label> <input class="editor-toolbar-input" id="link-q-cite" name="link-q-cite" placeholder="Paste or type a link (URL)" type="url" pattern="https?://.+" oninvalid="setCustomValidity('Please enter a valid URL')" 
   oninput="setCustomValidity('')"  />
    ${getButtonHTML('submit', 'editor-toolbar-submit', 'Save', 'Save', { type: 'submit' })}
    ${getButtonHTML('cancel', 'editor-toolbar-cancel', 'Cancel', 'Cancel', { type: 'button' })}
  `,

  // TODO: captions
// TODO: draggable area in this widget
//TODO: browse storage
  img: (options) => `<legend>Add an image with a description</legend>
    <figure class="link-img-preview"><p>Drag an image here</p></figure>
    <label for="link-img-file">Upload</label> <input class="editor-toolbar-input" id="link-img-file" name="link-img-file" type="file" />
    <label for="link-img-src">URL</label> <input class="editor-toolbar-input" id="link-img-src" name="link-img-src" placeholder="https://example.org/path/to/image.jpg" required="" type="text" />
    <label for="link-img-alt">Description</label> <input class="editor-toolbar-input" id="link-img-alt" name="link-img-alt" placeholder="Describe the image for people who are blind or have low vision." />
    <label for="link-img-figcaption">Caption</label> <input class="editor-toolbar-input" id="link-img-figcaption" name="link-img-figcaption" placeholder="A caption or legend for the figure." />
    ${getButtonHTML('submit', 'editor-toolbar-submit', 'Save', 'Save', { type: 'submit' })}
    ${getButtonHTML('cancel', 'editor-toolbar-cancel', 'Cancel', 'Cancel', { type: 'button' })}
  `,

  bookmark: (options) => annotateFormControls(options),
  approve: (options) => annotateFormControls(options),
  disapprove: (options) => annotateFormControls(options),
  specificity: (options) => annotateFormControls(options),
  comment: (options) => annotateFormControls(options),
  note: (options) => annotateFormControls(options),
}


function annotateFormControls(options) {
  return `
    <label for="${options.button}-tagging">Tags</label> <input class="editor-toolbar-input" id="${options.button}-tagging" name="comment-tagging" placeholder="Separate tags with commas" />
    <textarea class="editor-toolbar-textarea" cols="20" id="${options.button}-content" name="${options.button}-content" placeholder="${options.placeholder ? options.placeholder : 'What do you think?'}" required="" rows="5"></textarea>
<!-- getLanguageOptionsHTML() getLicenseOptionsHTML() -->
    <select class="editor-toolbar-select" name="${options.button}-language"><option selected="selected" value="">Choose a language</option><option value="en">English</option></select>
    <select class="editor-toolbar-select" name="${options.button}-license"><option selected="selected" value="">Choose a license</option><option value="https://creativecommons.org/licenses/by/4.0/">CC-BY</option></select>

    <span class="annotation-location-selection">{getAnnotationLocationHTML}</span>

    <span class="annotation-inbox">{getAnnotationInboxLocationHTML}</span>

    ${getButtonHTML('submit', 'editor-toolbar-submit', 'Post', 'Post', { type: 'submit' })}
    ${getButtonHTML('cancel', 'editor-toolbar-cancel', 'Cancel', 'Cancel', { type: 'button' })}
  `
}
