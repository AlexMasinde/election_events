import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { Event } from './Event';
import { CheckInLog } from './CheckInLog';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ type: 'varchar', length: 500, nullable: true })
  refreshToken: string | null;

  @Column({ type: 'uuid', nullable: true })
  adminId: string | null;

  @ManyToOne(() => User, (user) => user.users, { nullable: true })
  @JoinColumn({ name: 'adminId' })
  admin: User | null;

  @OneToMany(() => User, (user) => user.admin)
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Event, (event) => event.createdBy)
  events: Event[];

  @ManyToMany(() => Event, (event) => event.assignedUsers)
  @JoinTable({
    name: 'users_events',
    joinColumn: {
      name: 'userId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'eventId',
      referencedColumnName: 'eventId',
    },
  })
  assignedEvents: Event[];

  @OneToMany(() => CheckInLog, (checkInLog) => checkInLog.checkedInBy)
  checkInLogs: CheckInLog[];
}

