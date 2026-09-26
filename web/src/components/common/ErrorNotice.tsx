import { Alert } from '@mantine/core'

interface ErrorNoticeProps {
  message: string
  onClose?: () => void
}

export function ErrorNotice({ message, onClose }: ErrorNoticeProps) {
  return (
    <Alert color="red" role="alert" {...(onClose ? { withCloseButton: true, onClose } : {})}>
      {message}
    </Alert>
  )
}
