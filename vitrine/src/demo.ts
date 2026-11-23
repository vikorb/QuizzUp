import { initForm } from './form'

const form = document.querySelector<HTMLFormElement>('#demo-form')
if (form) {
  initForm(form)
}
