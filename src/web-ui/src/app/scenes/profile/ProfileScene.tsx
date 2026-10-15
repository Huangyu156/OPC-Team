import React from 'react';
import { NurseryView } from './views';
import './ProfileScene.scss';

const ProfileScene: React.FC = () => (
  <div className="opc-profile-scene" data-opc-scene="profile" data-opc-part="root">
    <NurseryView />
  </div>
);

export default ProfileScene;
