import React from 'react';

export default function MessageList({
  messages,
  otherUser,
  normalizeId,
  formatRelativeTime,
  beginMessageHold,
  clearHoldTimer
}) {
  return (
    <>
      {messages.map((item) => {
        const isOwn = normalizeId(item.senderId) !== normalizeId(otherUser?._id);
        return (
          <div key={item._id} className={`dmRow ${isOwn ? 'own' : 'other'} ${item.deletedForEveryone ? 'muted' : ''}`}>
            <div
              className={`dmBubble${isOwn && !item.deletedForEveryone ? ' pressable' : ''}`}
              onMouseDown={() => beginMessageHold(item, isOwn)}
              onMouseUp={clearHoldTimer}
              onMouseLeave={clearHoldTimer}
              onTouchStart={() => beginMessageHold(item, isOwn)}
              onTouchEnd={clearHoldTimer}
              onTouchCancel={clearHoldTimer}
            >
              {!item.deletedForEveryone && item.messageType !== 'text' && <strong>{item.messageType.replace('_', ' ')}</strong>}
              <span>{item.messageText}</span>
              {item.mediaUrl && (
                <a className="dmMediaLink" href={item.mediaUrl} target="_blank" rel="noreferrer">
                  Open media
                </a>
              )}
              <small>{formatRelativeTime(item.createdAt)} {item.seen ? '• Seen' : ''}</small>
            </div>
          </div>
        );
      })}
    </>
  );
}
